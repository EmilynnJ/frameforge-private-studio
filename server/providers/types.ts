export type VideoAspectRatio = "9:16";

export type VideoReferenceImage = {
  assetId: number;
  url: string;
  mimeType: string;
};

export type VideoGenerationRequest = {
  requestId: string;
  projectId: number;
  clipId: number;
  prompt: string;
  negativePrompt?: string;
  referenceImages: VideoReferenceImage[];
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  width: 1080;
  height: 1920;
  seed?: number;
  settings: Record<string, unknown>;
};

export type ProviderJobStatus = "queued" | "running" | "completed" | "failed";

export type ProviderErrorCode =
  | "authentication"
  | "credits_exhausted"
  | "quota_exceeded"
  | "rate_limited"
  | "unavailable"
  | "validation"
  | "retryable"
  | "fatal"
  | "unknown";

export type ProviderError = {
  code: ProviderErrorCode;
  message: string;
  fallbackEligible: boolean;
  retryAfterSeconds?: number;
  providerPayload?: unknown;
};

export type ProviderCapabilities = {
  aspectRatios: VideoAspectRatio[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  maxReferenceImages: number;
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  supportsNativeAudio: boolean;
  settingsSchema?: Record<string, unknown>;
};

export type ProviderAvailability = {
  available: boolean;
  reason?: string;
};

export type ProviderJob = {
  externalJobId: string;
  status: ProviderJobStatus;
  progress: number;
  outputUrl?: string;
  providerPayload?: unknown;
};

export interface VideoProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly adapterType: string;
  getCapabilities(): ProviderCapabilities;
  checkAvailability(): Promise<ProviderAvailability>;
  submit(request: VideoGenerationRequest): Promise<ProviderJob>;
  refresh(job: ProviderJob): Promise<ProviderJob>;
  classifyError(error: unknown): ProviderError;
}

export type ProviderPublicSummary = {
  id: string;
  label: string;
  adapterType: string;
  configured: boolean;
  available: boolean;
  unavailableReason?: string;
  capabilities: ProviderCapabilities;
};

export type ProviderAttemptEvent = {
  providerId: string;
  attempt: number;
  state: "checking" | "submitted" | "failed";
  job?: ProviderJob;
  error?: ProviderError;
};
