import { defaultClassifyProviderError, normalizedProviderError } from "./errors";
import type {
  ProviderCapabilities,
  ProviderError,
  ProviderJob,
  ProviderJobStatus,
  VideoGenerationRequest,
  VideoProviderAdapter,
} from "./types";

export type OpenRouterVideoConfig = {
  id: string;
  label?: string;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  generateAudio?: boolean;
  capabilities?: Partial<ProviderCapabilities>;
};

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  aspectRatios: ["9:16"],
  minDurationSeconds: 1,
  maxDurationSeconds: 30,
  maxReferenceImages: 1,
  supportsSeed: true,
  supportsNegativePrompt: false,
  supportsNativeAudio: true,
};

function normalizeStatus(value: unknown): ProviderJobStatus {
  const raw = String(value ?? "").toLowerCase();
  if (["completed", "succeeded", "success"].includes(raw)) return "completed";
  if (["failed", "error", "cancelled", "canceled", "expired"].includes(raw)) return "failed";
  if (raw === "pending" || raw === "queued") return "queued";
  return "running";
}

/**
 * Dedicated adapter for OpenRouter's video API (POST /api/v1/videos, poll
 * GET /api/v1/videos/{id}, download GET /api/v1/videos/{id}/content).
 * OpenRouter requires `model` + `prompt`, takes `frame_images` objects for
 * image-to-video, and requires the API key to download the finished file.
 */
export class OpenRouterVideoAdapter implements VideoProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly adapterType = "openrouter";
  private readonly baseUrl: string;

  constructor(private readonly config: OpenRouterVideoConfig) {
    this.id = config.id;
    this.label = config.label ?? `OpenRouter (${config.model})`;
    this.baseUrl = (config.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  }

  getCapabilities(): ProviderCapabilities {
    return { ...DEFAULT_CAPABILITIES, ...this.config.capabilities };
  }

  async checkAvailability() {
    if (!this.config.apiKey) return { available: false, reason: "OpenRouter API key is not configured." };
    if (!this.config.model) return { available: false, reason: "No OpenRouter video model is selected." };
    return { available: true };
  }

  private headers() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` };
  }

  buildBody(request: VideoGenerationRequest) {
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt: request.prompt,
      duration: request.durationSeconds,
      aspect_ratio: request.aspectRatio,
    };
    const first = request.referenceImages[0];
    if (first) {
      body.frame_images = [{ type: "image_url", image_url: { url: first.url }, frame_type: "first_frame" }];
    }
    if (request.seed !== undefined) body.seed = request.seed;
    if (this.config.generateAudio !== undefined) body.generate_audio = this.config.generateAudio;
    return body;
  }

  private parseJob(payload: unknown): ProviderJob {
    const data = (payload ?? {}) as Record<string, unknown>;
    const id = data.id;
    if (!id) throw new Error("OpenRouter response did not include a job id.");
    const status = normalizeStatus(data.status);
    if (status === "failed") {
      throw new Error(typeof data.error === "string" ? data.error : `OpenRouter job failed: ${JSON.stringify(data.error ?? data)}`);
    }
    return {
      externalJobId: String(id),
      status,
      progress: status === "completed" ? 100 : status === "running" ? 50 : 0,
      outputUrl: status === "completed" ? `${this.baseUrl}/videos/${encodeURIComponent(String(id))}/content?index=0` : undefined,
      outputHeaders: { Authorization: `Bearer ${this.config.apiKey}` },
      providerPayload: payload,
    };
  }

  async submit(request: VideoGenerationRequest) {
    const response = await fetch(`${this.baseUrl}/videos`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.buildBody(request)),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
    return this.parseJob(payload);
  }

  async refresh(job: ProviderJob) {
    const response = await fetch(`${this.baseUrl}/videos/${encodeURIComponent(job.externalJobId)}`, { headers: this.headers() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
    return this.parseJob(payload);
  }

  classifyError(error: unknown): ProviderError {
    const classified = defaultClassifyProviderError(error);
    if (classified.code === "unknown" && error instanceof TypeError) {
      return normalizedProviderError("unavailable", error.message, error);
    }
    return classified;
  }
}
