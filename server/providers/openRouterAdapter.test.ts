import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterVideoAdapter } from "./openRouterAdapter";
import type { VideoGenerationRequest } from "./types";

const request: VideoGenerationRequest = {
  requestId: "r1", projectId: 1, clipId: 2,
  prompt: "A glowing crystal ball on velvet",
  referenceImages: [{ assetId: 9, url: "https://example.com/ref.png", mimeType: "image/png" }],
  durationSeconds: 21, aspectRatio: "9:16", width: 1080, height: 1920, seed: 7, settings: {},
};

describe("OpenRouterVideoAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("always sends model and prompt, plus first-frame image object", () => {
    const adapter = new OpenRouterVideoAdapter({ id: "or", model: "alibaba/wan-3.0", apiKey: "k" });
    expect(adapter.buildBody(request)).toEqual({
      model: "alibaba/wan-3.0",
      prompt: "A glowing crystal ball on velvet",
      duration: 21,
      aspect_ratio: "9:16",
      frame_images: [{ type: "image_url", image_url: { url: "https://example.com/ref.png" }, frame_type: "first_frame" }],
      seed: 7,
    });
  });

  it("submits, then builds an authenticated download URL when completed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "job1", status: "pending" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "job1", status: "completed" }) });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new OpenRouterVideoAdapter({ id: "or", model: "alibaba/wan-3.0", apiKey: "k" });
    const job = await adapter.submit(request);
    expect(job).toMatchObject({ externalJobId: "job1", status: "queued" });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/videos");
    const done = await adapter.refresh(job);
    expect(done.status).toBe("completed");
    expect(done.outputUrl).toBe("https://openrouter.ai/api/v1/videos/job1/content?index=0");
    expect(done.outputHeaders).toEqual({ Authorization: "Bearer k" });
  });
});
