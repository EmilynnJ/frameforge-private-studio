import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { ownerProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import { createClipPlan } from "../planning/clipPlanner";

const MIN_DURATION = 61;

async function withSignedAssetUrls<T extends { storageKey: string }>(assets: T[]) {
  return Promise.all(assets.map(async asset => ({
    ...asset,
    url: await storageGetSignedUrl(asset.storageKey),
  })));
}

export const studioRouter = router({
  list: ownerProcedure.query(({ ctx }) => db.listVideoProjects(ctx.user.id)),
  get: ownerProcedure.input(z.object({ projectId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const bundle = await db.getProjectBundle(ctx.user.id, input.projectId);
    if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    return { ...bundle, assets: await withSignedAssetUrls(bundle.assets) };
  }),
  create: ownerProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(180),
      prompt: z.string().trim().min(12).max(12000),
      targetDurationSeconds: z.number().int().min(MIN_DURATION).max(300),
      videoProviderMode: z.enum(["automatic", "manual"]),
      selectedVideoProviderKey: z.string().trim().max(96).optional(),
    }).superRefine((value, ctx) => {
      if (value.videoProviderMode === "manual" && !value.selectedVideoProviderKey) {
        ctx.addIssue({ code: "custom", path: ["selectedVideoProviderKey"], message: "Choose a provider for manual mode." });
      }
    }))
    .mutation(({ ctx, input }) => db.createVideoProject({ ownerId: ctx.user.id, ...input })),
  update: ownerProcedure.input(z.object({
    projectId: z.number().int().positive(),
    name: z.string().trim().min(1).max(180).optional(),
    prompt: z.string().trim().min(12).max(12000).optional(),
    targetDurationSeconds: z.number().int().min(MIN_DURATION).max(300).optional(),
    videoProviderMode: z.enum(["automatic", "manual"]).optional(),
    selectedVideoProviderKey: z.string().trim().max(96).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { projectId, ...values } = input;
    const updated = await db.updateProject(ctx.user.id, projectId, values);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    return updated;
  }),
  uploadReference: ownerProcedure.input(z.object({
    projectId: z.number().int().positive(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64: z.string().min(1).max(16_000_000),
  })).mutation(async ({ ctx, input }) => {
    const project = await db.getVideoProject(ctx.user.id, input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    const bytes = Buffer.from(input.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (!bytes.length || bytes.length > 8_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Reference images must be 8 MB or smaller." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const stored = await storagePut(`users/${ctx.user.id}/projects/${input.projectId}/references/${safeName}`, bytes, input.mimeType);
    return db.addProjectAsset({
      ownerId: ctx.user.id,
      projectId: input.projectId,
      kind: "reference_image",
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      storageKey: stored.key,
      url: stored.key,
    });
  }),
  plan: ownerProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const bundle = await db.getProjectBundle(ctx.user.id, input.projectId);
    if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    await db.updateProject(ctx.user.id, input.projectId, { status: "planning" });
    const planningJobId = await db.createGenerationJob({
      ownerId: ctx.user.id,
      projectId: input.projectId,
      kind: "planning",
      providerKey: "studio-planner",
      adapterType: "openai-compatible",
      status: "running",
      progress: 10,
      requestJson: JSON.stringify({ targetDurationSeconds: bundle.project.targetDurationSeconds }),
    });
    try {
      const referenceUrls = await Promise.all(
        bundle.assets.filter(asset => asset.kind === "reference_image").map(asset => storageGetSignedUrl(asset.storageKey)),
      );
      const plan = await createClipPlan({
        ownerId: ctx.user.id,
        prompt: bundle.project.prompt,
        targetDurationSeconds: bundle.project.targetDurationSeconds,
        referenceUrls,
      });
      const clips = await db.replaceProjectClips(ctx.user.id, input.projectId, plan.clips.map((clip, index) => ({
        sequence: index + 1,
        title: clip.title,
        prompt: clip.prompt,
        negativePrompt: clip.negativePrompt,
        durationSeconds: clip.durationSeconds,
        seed: clip.seed,
      })));
      await db.updateProject(ctx.user.id, input.projectId, { planningProviderKey: plan.providerKey });
      await db.updateGenerationJob(ctx.user.id, planningJobId, {
        status: "completed",
        progress: 100,
        responseJson: JSON.stringify({ model: plan.model, clipCount: clips.length, totalDurationSeconds: plan.totalDurationSeconds }),
        completedAt: new Date(),
      });
      return { clips, totalDurationSeconds: plan.totalDurationSeconds };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Planning failed.";
      await db.updateProject(ctx.user.id, input.projectId, { status: "failed" });
      await db.updateGenerationJob(ctx.user.id, planningJobId, { status: "failed", errorMessage: message, completedAt: new Date() });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  }),
  updateTimeline: ownerProcedure.input(z.object({
    projectId: z.number().int().positive(),
    clips: z.array(z.object({
      id: z.number().int().positive(),
      sequence: z.number().int().positive(),
      durationSeconds: z.number().int().min(1).max(30),
    })).min(1).max(60),
  }).superRefine((value, ctx) => {
    const total = value.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0);
    if (total < MIN_DURATION) ctx.addIssue({ code: "custom", path: ["clips"], message: "The final timeline must be at least 61 seconds." });
    const sequences = new Set(value.clips.map(clip => clip.sequence));
    if (sequences.size !== value.clips.length) ctx.addIssue({ code: "custom", path: ["clips"], message: "Every timeline position must be unique." });
  })).mutation(async ({ ctx, input }) => {
    const project = await db.getVideoProject(ctx.user.id, input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    return db.updateProjectTimeline(ctx.user.id, input.projectId, input.clips);
  }),
  duplicate: ownerProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const bundle = await db.getProjectBundle(ctx.user.id, input.projectId);
    if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    const duplicate = await db.createVideoProject({
      ownerId: ctx.user.id,
      name: `${bundle.project.name} — new cut`.slice(0, 180),
      prompt: bundle.project.prompt,
      targetDurationSeconds: bundle.project.targetDurationSeconds,
      videoProviderMode: bundle.project.videoProviderMode,
      selectedVideoProviderKey: bundle.project.selectedVideoProviderKey ?? undefined,
    });
    if (!duplicate) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not duplicate project." });
    for (const asset of bundle.assets.filter(item => item.kind === "reference_image")) {
      await db.addProjectAsset({
        ownerId: ctx.user.id,
        projectId: duplicate.id,
        kind: "reference_image",
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        storageKey: asset.storageKey,
        url: asset.storageKey,
        width: asset.width,
        height: asset.height,
      });
    }
    if (bundle.clips.length) {
      await db.replaceProjectClips(ctx.user.id, duplicate.id, bundle.clips.map(clip => ({
        sequence: clip.sequence,
        title: clip.title,
        prompt: clip.prompt,
        negativePrompt: clip.negativePrompt ?? undefined,
        durationSeconds: clip.durationSeconds,
        seed: clip.seed ?? undefined,
        settingsJson: clip.settingsJson ?? undefined,
      })));
    }
    return db.getVideoProject(ctx.user.id, duplicate.id);
  }),
});
