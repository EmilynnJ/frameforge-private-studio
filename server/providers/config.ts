import * as db from "../db";
import { decryptProviderCredential } from "./credentialVault";
import { HttpJsonVideoProviderAdapter, type HttpJsonProviderConfig } from "./httpJsonAdapter";
import { OpenRouterVideoAdapter } from "./openRouterAdapter";
import { VideoProviderRegistry } from "./registry";

function parseObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function environmentConfigs() {
  const raw = process.env.VIDEO_PROVIDER_CONFIG_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Configuration must be a JSON array.");
    return parsed as HttpJsonProviderConfig[];
  } catch (error) {
    console.error("[VideoProviders] Invalid server-side provider configuration:", error);
    return [];
  }
}

export async function loadVideoProviders(ownerId: number) {
  const registry = new VideoProviderRegistry();
  for (const config of environmentConfigs()) {
    try {
      registry.register(new HttpJsonVideoProviderAdapter(config));
    } catch (error) {
      console.error(`[VideoProviders] Could not register environment adapter '${config?.id ?? "unknown"}':`, error);
    }
  }

  if (process.env.OPENROUTER_API_KEY) {
    const models = (process.env.OPENROUTER_VIDEO_MODELS ?? process.env.OPENROUTER_VIDEO_MODEL ?? "alibaba/wan-3.0")
      .split(",").map(item => item.trim()).filter(Boolean);
    for (const model of models) {
      registry.register(new OpenRouterVideoAdapter({
        id: `openrouter-${model.replace(/[^a-z0-9]+/gi, "-")}`,
        model,
        apiKey: process.env.OPENROUTER_API_KEY,
        generateAudio: false,
      }));
    }
  }

  const connections = await db.listProviderConnections(ownerId);
  for (const connection of connections) {
    try {
      if (registry.get(connection.providerKey)) registry.unregister(connection.providerKey);
      registry.register(new HttpJsonVideoProviderAdapter({
        id: connection.providerKey,
        label: connection.label,
        adapterType: connection.adapterType,
        submitUrl: connection.submitUrl,
        statusUrlTemplate: connection.statusUrlTemplate ?? undefined,
        apiKey: decryptProviderCredential(connection.apiKeyEncrypted),
        apiKeyHeader: connection.apiKeyHeader,
        apiKeyPrefix: connection.apiKeyPrefix,
        headers: parseObject<Record<string, string>>(connection.headersJson, {}),
        model: connection.model ?? undefined,
        modelField: connection.modelField ?? undefined,
        requestMap: parseObject<HttpJsonProviderConfig["requestMap"]>(connection.requestMapJson, {}),
        responseMap: parseObject<HttpJsonProviderConfig["responseMap"]>(connection.responseMapJson, { idPath: "id", statusPath: "status" }),
        statusMap: parseObject<HttpJsonProviderConfig["statusMap"]>(connection.statusMapJson, undefined),
        capabilities: parseObject<HttpJsonProviderConfig["capabilities"]>(connection.capabilitiesJson, {
          aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12,
          maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false,
        }),
      }));
    } catch (error) {
      console.error(`[VideoProviders] Could not register saved adapter '${connection.providerKey}':`, error instanceof Error ? error.message : "Unknown error");
    }
  }
  return registry;
}

export function redactedConnection(connection: Awaited<ReturnType<typeof db.listProviderConnections>>[number]) {
  return {
    providerKey: connection.providerKey,
    label: connection.label,
    adapterType: connection.adapterType,
    submitUrl: connection.submitUrl,
    statusUrlTemplate: connection.statusUrlTemplate,
    apiKeyHeader: connection.apiKeyHeader,
    apiKeyPrefix: connection.apiKeyPrefix,
    hasApiKey: Boolean(connection.apiKeyEncrypted),
    model: connection.model,
    modelField: connection.modelField,
    headers: parseObject<Record<string, string>>(connection.headersJson, {}),
    requestMap: parseObject<HttpJsonProviderConfig["requestMap"]>(connection.requestMapJson, {}),
    responseMap: parseObject<HttpJsonProviderConfig["responseMap"]>(connection.responseMapJson, { idPath: "id", statusPath: "status" }),
    statusMap: parseObject<HttpJsonProviderConfig["statusMap"]>(connection.statusMapJson, undefined),
    capabilities: parseObject<HttpJsonProviderConfig["capabilities"]>(connection.capabilitiesJson, {
      aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12,
      maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false,
    }),
  };
}
