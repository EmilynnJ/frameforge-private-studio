import type { ProviderError, ProviderErrorCode } from "./types";

const FALLBACK_ELIGIBLE = new Set<ProviderErrorCode>([
  "credits_exhausted",
  "quota_exceeded",
  "rate_limited",
  "unavailable",
  "retryable",
  "unknown",
]);

export class VideoProviderError extends Error {
  readonly detail: ProviderError;

  constructor(detail: ProviderError) {
    super(detail.message);
    this.name = "VideoProviderError";
    this.detail = detail;
  }
}

export function normalizedProviderError(
  code: ProviderErrorCode,
  message: string,
  providerPayload?: unknown,
): ProviderError {
  return {
    code,
    message,
    fallbackEligible: FALLBACK_ELIGIBLE.has(code),
    providerPayload,
  };
}

export function defaultClassifyProviderError(error: unknown): ProviderError {
  if (error instanceof VideoProviderError) return error.detail;

  const message = error instanceof Error ? error.message : "Unknown provider failure";
  const normalized = message.toLowerCase();

  if (normalized.includes("401") || normalized.includes("403") || normalized.includes("auth")) {
    return normalizedProviderError("authentication", message, error);
  }
  if (normalized.includes("credit") || normalized.includes("balance")) {
    return normalizedProviderError("credits_exhausted", message, error);
  }
  if (normalized.includes("quota")) {
    return normalizedProviderError("quota_exceeded", message, error);
  }
  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return normalizedProviderError("rate_limited", message, error);
  }
  if (normalized.includes("timeout") || normalized.includes("503") || normalized.includes("unavailable")) {
    return normalizedProviderError("unavailable", message, error);
  }
  if (normalized.includes("invalid") || normalized.includes("validation") || normalized.includes("400")) {
    return normalizedProviderError("validation", message, error);
  }

  return normalizedProviderError("unknown", message, error);
}
