import type { ProviderPublicSummary, VideoProviderAdapter } from "./types";

export class VideoProviderRegistry {
  private readonly adapters = new Map<string, VideoProviderAdapter>();

  register(adapter: VideoProviderAdapter) {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Video provider '${adapter.id}' is already registered`);
    }
    this.adapters.set(adapter.id, adapter);
    return this;
  }

  unregister(providerId: string) {
    this.adapters.delete(providerId);
  }

  get(providerId: string) {
    return this.adapters.get(providerId);
  }

  ids() {
    return Array.from(this.adapters.keys());
  }

  async publicSummaries(): Promise<ProviderPublicSummary[]> {
    return Promise.all(
      Array.from(this.adapters.values()).map(async adapter => {
        const availability = await adapter.checkAvailability().catch((error: unknown) => ({
          available: false,
          reason: error instanceof Error ? error.message : "Availability check failed",
        }));

        return {
          id: adapter.id,
          label: adapter.label,
          adapterType: adapter.adapterType,
          configured: true,
          available: availability.available,
          unavailableReason: availability.reason,
          capabilities: adapter.getCapabilities(),
        };
      }),
    );
  }
}

// Intentionally empty. Providers are registered from server-only configuration.
// No vendor is mandatory, implicit, or permanently selected.
export const videoProviderRegistry = new VideoProviderRegistry();
