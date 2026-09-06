import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { ownerProcedure, router } from "../_core/trpc";
import { loadVideoProviders } from "../providers/config";
import { submitWithFallback } from "../providers/orchestrator";
import type { ProviderAttemptEvent, ProviderJob, VideoGenerationRequest } from "../providers/types";
import { normalizedProviderError } from "../providers/errors";
import { storageGetSignedUrl, storagePut } from "../storage";

async function submitClip(ownerId: number, clipId: number, excludedProviderIds: string[] = []) {
  const context = await db.getClipContext(ownerId, clipId);
  if (!context?.project) throw new TRPCError({ code: "NOT_FOUND", message: "Clip not found." });
  const registry = await loadVideoProviders(ownerId);
  const preferences = (await db.listProviderPreferences(ownerId)).filter(item => item.enabled);
  const automaticProviderIds = preferences.length ? preferences.map(item => item.providerKey) : registry.ids();
  const providerIds = (context.project.videoProviderMode === "manual"
    ? [context.project.selectedVideoProviderKey ?? ""]
    : automaticProviderIds).filter(providerId => !excludedProviderIds.includes(providerId));
  const referenceImages = await Promise.all(context.references.map(async asset => ({
    assetId: asset.id,
    url: await storageGetSignedUrl(asset.storageKey),
    mimeType: asset.mimeType,
  })));
  const request: VideoGenerationRequest = {
    requestId: crypto.randomUUID(),
    projectId: context.project.id,
    clipId: context.clip.id,
    prompt: context.clip.prompt,
    negativePrompt: context.clip.negativePrompt ?? undefined,
    referenceImages,
    durationSeconds: context.clip.durationSeconds,
    aspectRatio: "9:16",
    width: 1080,
    height: 1920,
    seed: context.clip.seed ?? undefined,
    settings: context.clip.settingsJson ? JSON.parse(context.clip.settingsJson) : {},
  };
  const attemptJobs = new Map<number, number>();
  const onAttempt = async (event: ProviderAttemptEvent) => {
    if (event.state === "checking") {
      const jobId = await db.createGenerationJob({
        ownerId,
        projectId: context.project!.id,
        clipId,
        kind: "video",
        providerKey: event.providerId,
        adapterType: registry.get(event.providerId)?.adapterType,
        status: "queued",
        progress: 0,
        attempt: event.attempt,
        requestJson: JSON.stringify({ ...request, referenceImages: request.referenceImages.map(image => ({ assetId: image.assetId, mimeType: image.mimeType })) }),
      });
      attemptJobs.set(event.attempt, jobId);
      return;
    }
    const jobId = attemptJobs.get(event.attempt);
    if (!jobId) return;
    if (event.state === "failed") {
      await db.updateGenerationJob(ownerId, jobId, {
        status: "failed",
        errorCode: event.error?.code,
        errorMessage: event.error?.message,
        fallbackEligible: event.error?.fallbackEligible ?? false,
        completedAt: new Date(),
      });
    } else if (event.job) {
      await db.updateGenerationJob(ownerId, jobId, {
        externalJobId: event.job.externalJobId,
        status: event.job.status,
        progress: event.job.progress,
        responseJson: JSON.stringify({ externalJobId: event.job.externalJobId, status: event.job.status, progress: event.job.progress, outputUrl: event.job.outputUrl }),
      });
      await db.updateClip(ownerId, clipId, { activeJobId: jobId, providerKey: event.providerId, status: event.job.status === "completed" ? "completed" : event.job.status });
    }
  };
  const result = await submitWithFallback({ request, providerIds, registry, onAttempt });
  let finalJobId: number | undefined;
  for (const event of result.attempts) {
    if (event.state === "submitted") finalJobId = attemptJobs.get(event.attempt);
  }
  if (result.job.status === "completed" && result.job.outputUrl && finalJobId) {
    await persistCompletedClip(ownerId, finalJobId, result.job);
    await db.updateGenerationJob(ownerId, finalJobId, { status: "completed", progress: 100, completedAt: new Date() });
  }
  await db.updateProject(ownerId, context.project.id, { status: "generating" });
  return { providerId: result.provider.id, job: result.job, attempts: result.attempts };
}

async function persistCompletedClip(ownerId: number, jobId: number, providerJob: ProviderJob) {
  const job = await db.getGenerationJob(ownerId, jobId);
  if (!job?.clipId || !providerJob.outputUrl) return;
  const response = await fetch(providerJob.outputUrl);
  if (!response.ok) throw new Error(`Could not download completed clip (${response.status}).`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 75_000_000) throw new Error("Completed clip exceeds the 75 MB storage limit.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 75_000_000) throw new Error("Completed clip exceeds the 75 MB storage limit.");
  const context = await db.getClipContext(ownerId, job.clipId);
  if (!context?.project) return;
  const stored = await storagePut(`users/${ownerId}/projects/${job.projectId}/clips/clip-${job.clipId}.mp4`, bytes, "video/mp4");
  const asset = await db.addProjectAsset({
    ownerId,
    projectId: job.projectId,
    kind: "generated_clip",
    fileName: `clip-${job.clipId}.mp4`,
    mimeType: "video/mp4",
    sizeBytes: bytes.length,
    durationSeconds: context.clip.durationSeconds,
    width: 1080,
    height: 1920,
    storageKey: stored.key,
    url: stored.url,
  });
  await db.updateClip(ownerId, job.clipId, { outputAssetId: asset!.id, status: "completed" });
}

export const generationRouter = router({
  submitClip: ownerProcedure.input(z.object({ clipId: z.number().int().positive() })).mutation(({ ctx, input }) => submitClip(ctx.user.id, input.clipId)),
  submitProject: ownerProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const bundle = await db.getProjectBundle(ctx.user.id, input.projectId);
    if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    const results = [];
    for (const clip of bundle.clips) results.push(await submitClip(ctx.user.id, clip.id));
    return results;
  }),
  refreshJob: ownerProcedure.input(z.object({ jobId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const job = await db.getGenerationJob(ctx.user.id, input.jobId);
    if (!job?.providerKey || !job.externalJobId) throw new TRPCError({ code: "NOT_FOUND", message: "Provider job not found." });
    const adapter = (await loadVideoProviders(ctx.user.id)).get(job.providerKey);
    if (!adapter) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That provider adapter is no longer configured." });
    try {
      const refreshed = await adapter.refresh({
        externalJobId: job.externalJobId,
        status: job.status,
        progress: job.progress,
      });
      await db.updateGenerationJob(ctx.user.id, job.id, {
        status: refreshed.status === "completed" ? "running" : refreshed.status,
        progress: refreshed.status === "completed" ? 95 : refreshed.progress,
        responseJson: JSON.stringify({ externalJobId: refreshed.externalJobId, status: refreshed.status, progress: refreshed.progress, outputUrl: refreshed.outputUrl }),
      });
      if (refreshed.status === "failed") {
        const failure = normalizedProviderError("unknown", `${adapter.label} reported that the job failed.`);
        await db.updateGenerationJob(ctx.user.id, job.id, { status: "failed", errorCode: failure.code, errorMessage: failure.message, fallbackEligible: failure.fallbackEligible, completedAt: new Date() });
        if (job.clipId && contextProjectIsAutomatic(job, await db.getClipContext(ctx.user.id, job.clipId))) {
          return submitClip(ctx.user.id, job.clipId, [job.providerKey]);
        }
      }
      if (refreshed.status === "completed") {
        await persistCompletedClip(ctx.user.id, job.id, refreshed);
        await db.updateGenerationJob(ctx.user.id, job.id, { status: "completed", progress: 100, completedAt: new Date() });
      }
      if (job.clipId) await db.updateClip(ctx.user.id, job.clipId, { status: refreshed.status === "completed" ? "completed" : refreshed.status });
      return refreshed;
    } catch (error) {
      const classified = adapter.classifyError(error);
      await db.updateGenerationJob(ctx.user.id, job.id, { status: "failed", errorCode: classified.code, errorMessage: classified.message, fallbackEligible: classified.fallbackEligible, completedAt: new Date() });
      if (job.clipId) {
        const clipContext = await db.getClipContext(ctx.user.id, job.clipId);
        if (classified.fallbackEligible && contextProjectIsAutomatic(job, clipContext)) {
          return submitClip(ctx.user.id, job.clipId, [job.providerKey]);
        }
        await db.updateClip(ctx.user.id, job.clipId, { status: "failed" });
      }
      throw new TRPCError({ code: "BAD_GATEWAY", message: classified.message });
    }
  }),
});

function contextProjectIsAutomatic(
  job: { providerKey: string | null },
  context: Awaited<ReturnType<typeof db.getClipContext>>,
) {
  return Boolean(job.providerKey && context?.project?.videoProviderMode === "automatic");
}
