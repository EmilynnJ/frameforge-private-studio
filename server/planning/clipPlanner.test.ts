import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({
  listLLMModels: vi.fn(async () => ({ data: [{ id: "gpt-5-mini" }] })),
  invokeLLM: vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({ clips: [{
      title: "Opening",
      prompt: "A vertical cinematic opening with a slow push-in.",
      negativePrompt: "watermarks",
      durationSeconds: 6,
      seed: null,
    }] }) } }],
  })),
}));

describe("structured clip planning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expands a short model response into a plan of at least 61 seconds", async () => {
    const { createClipPlan } = await import("./clipPlanner");
    const plan = await createClipPlan({
      prompt: "A continuous atmospheric portrait story.",
      targetDurationSeconds: 61,
      referenceUrls: [],
    });
    expect(plan.clips.length).toBeGreaterThanOrEqual(8);
    expect(plan.totalDurationSeconds).toBeGreaterThanOrEqual(61);
    expect(plan.clips.every(clip => clip.durationSeconds >= 6)).toBe(true);
  });
});

