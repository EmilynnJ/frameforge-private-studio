import { describe, expect, it } from "vitest";
import { redactedConnection } from "./config";
import { decryptProviderCredential, encryptProviderCredential } from "./credentialVault";

describe("provider credential vault", () => {
  it("encrypts credentials at rest and can decrypt them server-side", () => {
    const secret = "provider-key-that-must-not-leak";
    const encrypted = encryptProviderCredential(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptProviderCredential(encrypted)).toBe(secret);
  });

  it("removes encrypted credential material from owner-facing connection data", () => {
    const response = redactedConnection({
      id: 1,
      ownerId: 1,
      providerKey: "renderer-a",
      label: "Renderer A",
      adapterType: "http-json",
      submitUrl: "https://example.com/jobs",
      statusUrlTemplate: "https://example.com/jobs/{id}",
      apiKeyEncrypted: "v1:sensitive:ciphertext:value",
      apiKeyHeader: "Authorization",
      apiKeyPrefix: "Bearer ",
      model: "video-model",
      modelField: "model",
      headersJson: "{}",
      requestMapJson: JSON.stringify({ prompt: "input.prompt" }),
      responseMapJson: JSON.stringify({ idPath: "id", statusPath: "status" }),
      statusMapJson: null,
      capabilitiesJson: JSON.stringify({ aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12, maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(response.hasApiKey).toBe(true);
    expect(JSON.stringify(response)).not.toContain("sensitive");
    expect(JSON.stringify(response)).not.toContain("apiKeyEncrypted");
  });
});
