import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

function context(openId: string): TrpcContext {
  return {
    user: {
      id: 1,
      openId,
      name: "Studio Owner",
      email: "owner@example.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("private studio authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OWNER_OPEN_ID = "private-owner";
  });

  it("allows the configured owner", async () => {
    const { ownerProcedure, router } = await import("./_core/trpc");
    const caller = router({ probe: ownerProcedure.query(() => "allowed") }).createCaller(context("private-owner"));
    await expect(caller.probe()).resolves.toBe("allowed");
  });

  it("rejects any other authenticated user", async () => {
    const { ownerProcedure, router } = await import("./_core/trpc");
    const caller = router({ probe: ownerProcedure.query(() => "allowed") }).createCaller(context("another-user"));
    await expect(caller.probe()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects provider credential creation from a non-owner before database work", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(context("another-user"));
    await expect(caller.providers.create({
      label: "Private renderer",
      submitUrl: "https://provider.example/jobs",
      statusUrlTemplate: "https://provider.example/jobs/{id}",
      apiKey: "must-never-be-used",
      apiKeyHeader: "Authorization",
      apiKeyPrefix: "Bearer ",
      model: "video-model",
      modelField: "model",
      headers: {},
      requestMap: { prompt: "input.prompt", negativePrompt: "", referenceImages: "input.images", durationSeconds: "input.duration", aspectRatio: "input.aspect_ratio", width: "", height: "", seed: "", settings: "" },
      responseMap: { idPath: "id", statusPath: "status", progressPath: "progress", outputUrlPath: "output_url", errorPath: "error" },
      statusMap: { queued: ["queued"], running: ["running"], completed: ["completed"], failed: ["failed"] },
      capabilities: { aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12, maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
