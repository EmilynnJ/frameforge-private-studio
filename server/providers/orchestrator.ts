import { defaultClassifyProviderError, normalizedProviderError, VideoProviderError } from "./errors";
import type {
  ProviderAttemptEvent,
  ProviderError,
  ProviderJob,
  VideoGenerationRequest,
  VideoProviderAdapter,
} from "./types";
import type { VideoProviderRegistry } from "./registry";

export type FallbackSubmissionResult = {
  provider: VideoProviderAdapter;
  job: ProviderJob;
  attempts: ProviderAttemptEvent[];
};

export async function submitWithFallback(input: {
  request: VideoGenerationRequest;
  providerIds: string[];
  registry: VideoProviderRegistry;
  onAttempt?: (event: ProviderAttemptEvent) => Promise<void> | void;
}): Promise<FallbackSubmissionResult> {
  const providerIds = Array.from(new Set(input.providerIds.filter(Boolean)));
  if (providerIds.length === 0) {
    throw new VideoProviderError(
      normalizedProviderError("validation", "No video providers are configured or selected."),
    );
  }

  const attempts: ProviderAttemptEvent[] = [];
  let lastError: ProviderError | undefined;

  for (let index = 0; index < providerIds.length; index += 1) {
    const providerId = providerIds[index]!;
    const attempt = index + 1;
    const adapter = input.registry.get(providerId);
    const checking: ProviderAttemptEvent = { providerId, attempt, state: "checking" };
    attempts.push(checking);
    await input.onAttempt?.(checking);

    if (!adapter) {
      lastError = normalizedProviderError("unavailable", `Provider '${providerId}' is not registered.`);
      const failed: ProviderAttemptEvent = { providerId, attempt, state: "failed", error: lastError };
      attempts.push(failed);
      await input.onAttempt?.(failed);
      continue;
    }

    try {
      const availability = await adapter.checkAvailability();
      if (!availability.available) {
        throw new VideoProviderError(
          normalizedProviderError("unavailable", availability.reason ?? `${adapter.label} is unavailable.`),
        );
      }

      const job = await adapter.submit(input.request);
      const submitted: ProviderAttemptEvent = { providerId, attempt, state: "submitted", job };
      attempts.push(submitted);
      await input.onAttempt?.(submitted);
      return { provider: adapter, job, attempts };
    } catch (error) {
      lastError = adapter.classifyError?.(error) ?? defaultClassifyProviderError(error);
      const failed: ProviderAttemptEvent = { providerId, attempt, state: "failed", error: lastError };
      attempts.push(failed);
      await input.onAttempt?.(failed);
      if (!lastError.fallbackEligible) throw new VideoProviderError(lastError);
    }
  }

  throw new VideoProviderError(
    lastError ?? normalizedProviderError("unavailable", "Every configured video provider failed."),
  );
}
