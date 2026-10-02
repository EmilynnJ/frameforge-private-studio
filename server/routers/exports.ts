import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ownerProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { assembleVerticalVideo } from "../export/assembler";

export const exportsRouter = router({
  assemble: ownerProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const bundle = await db.getProjectBundle(ctx.user.id, input.projectId);
    if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." });
    const totalDurationSeconds = bundle.clips.reduce((sum, clip) => sum + clip.durationSeconds, 0);
    if (totalDurationSeconds < 61) throw new TRPCError({ code: "BAD_REQUEST", message: "The final timeline must be at least 61 seconds." });
    if (!bundle.clips.length || bundle.clips.some(clip => clip.status !== "completed" || !clip.outputAssetId)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Every timeline clip must be completed before export." });
    }
    const assetMap = new Map(bundle.assets.map(asset => [asset.id, asset]));
    const clips = bundle.clips.map(clip => ({
      storageKey: assetMap.get(clip.outputAssetId!)?.storageKey ?? "",
      durationSeconds: clip.durationSeconds,
    }));
    if (clips.some(clip => !clip.storageKey)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A completed clip artifact is missing." });

    const jobId = await db.createGenerationJob({
      ownerId: ctx.user.id,
      projectId: input.projectId,
      kind: "export",
      adapterType: "ffmpeg",
      status: "running",
      progress: 5,
      requestJson: JSON.stringify({ clipCount: clips.length, durationSeconds: totalDurationSeconds, width: 1080, height: 1920 }),
    });
    const exportId = await db.createVideoExport({
      ownerId: ctx.user.id,
      projectId: input.projectId,
      jobId,
      status: "running",
      durationSeconds: totalDurationSeconds,
      width: 1080,
      height: 1920,
    });
    await db.updateProject(ctx.user.id, input.projectId, { status: "assembling" });

    try {
      const result = await assembleVerticalVideo({ ownerId: ctx.user.id, projectId: input.projectId, clips });
      const asset = await db.addProjectAsset({
        ownerId: ctx.user.id,
        projectId: input.projectId,
        kind: "final_export",
        fileName: `studiocut-${input.projectId}-${exportId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: result.sizeBytes,
        durationSeconds: result.durationSeconds,
        width: 1080,
        height: 1920,
        storageKey: result.key,
        url: result.url,
      });
      await db.updateVideoExport(ctx.user.id, exportId, { assetId: asset!.id, status: "completed", completedAt: new Date() });
      await db.updateGenerationJob(ctx.user.id, jobId, { status: "completed", progress: 100, responseJson: JSON.stringify({ assetId: asset!.id }), completedAt: new Date() });
      await db.updateProject(ctx.user.id, input.projectId, { status: "completed" });
      return { exportId, asset };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Video assembly failed.";
      await db.updateVideoExport(ctx.user.id, exportId, { status: "failed", errorMessage: message, completedAt: new Date() });
      await db.updateGenerationJob(ctx.user.id, jobId, { status: "failed", errorMessage: message, completedAt: new Date() });
      await db.updateProject(ctx.user.id, input.projectId, { status: "failed" });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  }),
});
