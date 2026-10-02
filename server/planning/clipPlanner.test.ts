import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  connection: {
    providerKey: "script-writer",
    model: "test-model",
    submitUrl: "https://api.example.test/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    apiKeyEncrypted: "encrypted-key",
    headersJson: "{}",
  },
}));

vi.mock("../db", () => ({
  getProviderConnectionByKind: vi.fn(async () => mocked.connection),
}));
vi.mock("../providers/credentialVault", () => ({
  decryptProviderCredential: vi.fn(() => "private-provider-key"),
}));

describe("structured clip planning", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uses the configured script provider and expands a short response into at least 61 seconds", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ clips: [{
        title: "Opening",
        prompt: "A vertical cinematic opening with a slow push-in.",
        negativePrompt: "watermarks",
        durationSeconds: 6,
        seed: null,
      }] }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { createClipPlan } = await import("./clipPlanner");

    const plan = await createClipPlan({
      ownerId: 7,
      prompt: "A continuous atmospheric portrait story.",
      targetDurationSeconds: 61,
      referenceUrls: [],
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    expect(plan.providerKey).toBe("script-writer");
    expect(plan.clips.length).toBeGreaterThanOrEqual(8);
    expect(plan.totalDurationSeconds).toBeGreaterThanOrEqual(61);
    expect(plan.clips.every(clip => clip.durationSeconds >= 6)).toBe(true);
  });
});
