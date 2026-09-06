import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptProviderCredential } from "./credentialVault";

const mocked = vi.hoisted(() => ({ connections: [] as Array<Record<string, unknown>> }));

vi.mock("../db", () => ({
  listProviderConnections: vi.fn(async () => mocked.connections),
}));

describe("database-backed video provider registry", () => {
  beforeEach(() => {
    mocked.connections.length = 0;
    delete process.env.VIDEO_PROVIDER_CONFIG_JSON;
  });

  it("loads an owner connection into a fresh runtime registry without exposing its key", async () => {
    mocked.connections.push({
      id: 1, ownerId: 7, providerKey: "saved-renderer", label: "Saved Renderer", adapterType: "http-json",
      submitUrl: "https://provider.example/jobs", statusUrlTemplate: "https://provider.example/jobs/{id}",
      apiKeyEncrypted: encryptProviderCredential("private-provider-key"), apiKeyHeader: "Authorization", apiKeyPrefix: "Bearer ",
      model: "video-model", modelField: "model", headersJson: "{}",
      requestMapJson: JSON.stringify({ prompt: "input.prompt", referenceImages: "input.images" }),
      responseMapJson: JSON.stringify({ idPath: "id", statusPath: "status", outputUrlPath: "output_url" }),
      statusMapJson: JSON.stringify({ queued: ["queued"], running: ["running"], completed: ["completed"], failed: ["failed"] }),
      capabilitiesJson: JSON.stringify({ aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12, maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false }),
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { loadVideoProviders } = await import("./config");
    const registry = await loadVideoProviders(7);
    expect(registry.ids()).toEqual(["saved-renderer"]);
    expect(JSON.stringify(await registry.publicSummaries())).not.toContain("private-provider-key");
  });
});
