import { HttpJsonVideoProviderAdapter, type HttpJsonProviderConfig } from "./httpJsonAdapter";
import { videoProviderRegistry } from "./registry";

let loaded = false;

export function loadVideoProvidersFromServerConfig() {
  if (loaded) return videoProviderRegistry;
  loaded = true;

  const raw = process.env.VIDEO_PROVIDER_CONFIG_JSON;
  if (!raw) return videoProviderRegistry;

  let configs: HttpJsonProviderConfig[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Configuration must be a JSON array.");
    configs = parsed as HttpJsonProviderConfig[];
  } catch (error) {
    console.error("[VideoProviders] Invalid server-side provider configuration:", error);
    return videoProviderRegistry;
  }

  configs.forEach(config => {
    try {
      videoProviderRegistry.register(new HttpJsonVideoProviderAdapter(config));
    } catch (error) {
      console.error(`[VideoProviders] Could not register '${config?.id ?? "unknown"}':`, error);
    }
  });

  return videoProviderRegistry;
}
