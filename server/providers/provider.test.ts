import { describe, expect, it } from "vitest";
import { submitWithFallback } from "./orchestrator";
import { VideoProviderRegistry } from "./registry";
import type { ProviderError, VideoGenerationRequest, VideoProviderAdapter } from "./types";
import { HttpJsonVideoProviderAdapter } from "./httpJsonAdapter";

const request: VideoGenerationRequest = {
  requestId: "request-1",
  projectId: 1,
  clipId: 1,
  prompt: "A quiet cinematic reveal",
  referenceImages: [],
  durationSeconds: 8,
  aspectRatio: "9:16",
  width: 1080,
  height: 1920,
  settings: {},
};

function adapter(id: string, behavior: "success" | "quota" | "validation"): VideoProviderAdapter {
  return {
    id,
    label: id,
    adapterType: "test",
    getCapabilities: () => ({
      aspectRatios: ["9:16"],
      minDurationSeconds: 1,
      maxDurationSeconds: 12,
      maxReferenceImages: 4,
      supportsSeed: true,
      supportsNegativePrompt: true,
      supportsNativeAudio: false,
    }),
    checkAvailability: async () => ({ available: true }),
    submit: async () => {
      if (behavior === "quota") throw new Error("quota exceeded");
      if (behavior === "validation") throw new Error("400 invalid duration");
      return { externalJobId: `${id}-job`, status: "queued", progress: 0 };
    },
    refresh: async job => job,
    classifyError: error => {
      const message = error instanceof Error ? error.message : "unknown";
      const detail: ProviderError = message.includes("quota")
        ? { code: "quota_exceeded", message, fallbackEligible: true }
        : { code: "validation", message, fallbackEligible: false };
      return detail;
    },
  };
}

describe("provider-agnostic video orchestration", () => {
  it("starts with no mandatory provider", () => {
    expect(new VideoProviderRegistry().ids()).toEqual([]);
  });

  it("uses the configured order and falls back after quota errors", async () => {
    const registry = new VideoProviderRegistry()
      .register(adapter("first", "quota"))
      .register(adapter("second", "success"));

    const result = await submitWithFallback({ request, providerIds: ["first", "second"], registry });

    expect(result.provider.id).toBe("second");
    expect(result.job.externalJobId).toBe("second-job");
    expect(result.attempts.some(event => event.providerId === "first" && event.state === "failed")).toBe(true);
  });

  it("does not fall back after a non-eligible validation error", async () => {
    const registry = new VideoProviderRegistry()
      .register(adapter("first", "validation"))
      .register(adapter("second", "success"));

    await expect(
      submitWithFallback({ request, providerIds: ["first", "second"], registry }),
    ).rejects.toThrow("invalid duration");
  });

  it("never exposes provider credentials in public registry summaries", async () => {
    const registry = new VideoProviderRegistry().register(new HttpJsonVideoProviderAdapter({
      id: "secure-http",
      label: "Secure HTTP",
      submitUrl: "https://example.invalid/jobs",
      apiKey: "super-secret-provider-key",
      requestMap: { prompt: "prompt" },
      responseMap: { idPath: "id", statusPath: "status" },
      capabilities: {
        aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12,
        maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false,
      },
    }));
    const summaries = await registry.publicSummaries();
    expect(JSON.stringify(summaries)).not.toContain("super-secret-provider-key");
  });

  it("normalizes provider-specific queued and completed states", async () => {
    const responses = [
      { ok: true, json: async () => ({ task: { id: "job-1", state: "waiting" } }) },
      { ok: true, json: async () => ({ task: { id: "job-1", state: "finished", url: "https://cdn.example/video.mp4" } }) },
    ];
    const originalFetch = global.fetch;
    global.fetch = (async () => responses.shift() as Response) as typeof fetch;
    try {
      const adapter = new HttpJsonVideoProviderAdapter({
        id: "mapped", label: "Mapped", submitUrl: "https://provider.example/jobs",
        statusUrlTemplate: "https://provider.example/jobs/{id}", apiKey: "secret",
        requestMap: { prompt: "input.text", durationSeconds: "input.seconds" },
        responseMap: { idPath: "task.id", statusPath: "task.state", outputUrlPath: "task.url" },
        statusMap: { queued: ["waiting"], completed: ["finished"] },
        capabilities: {
          aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12,
          maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false,
        },
      });
      const submitted = await adapter.submit(request);
      const completed = await adapter.refresh(submitted);
      expect(submitted.status).toBe("queued");
      expect(completed).toMatchObject({ status: "completed", progress: 100, outputUrl: "https://cdn.example/video.mp4" });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
