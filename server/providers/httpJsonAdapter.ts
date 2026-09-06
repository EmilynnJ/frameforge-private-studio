import { defaultClassifyProviderError, normalizedProviderError } from "./errors";
import type {
  ProviderCapabilities,
  ProviderError,
  ProviderJob,
  ProviderJobStatus,
  VideoGenerationRequest,
  VideoProviderAdapter,
} from "./types";

type RequestField =
  | "prompt"
  | "negativePrompt"
  | "referenceImages"
  | "durationSeconds"
  | "aspectRatio"
  | "width"
  | "height"
  | "seed"
  | "settings";

export type HttpJsonProviderConfig = {
  id: string;
  label: string;
  adapterType?: string;
  submitUrl: string;
  statusUrlTemplate?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  headers?: Record<string, string>;
  model?: string;
  modelField?: string;
  requestMap: Partial<Record<RequestField, string>>;
  responseMap: {
    idPath: string;
    statusPath: string;
    progressPath?: string;
    outputUrlPath?: string;
    errorPath?: string;
  };
  statusMap?: Partial<Record<ProviderJobStatus, string[]>>;
  capabilities: ProviderCapabilities;
};

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  });
}

function getPath(source: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split(".").filter(Boolean).reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, source);
}

function normalizeStatus(value: unknown, statusMap?: HttpJsonProviderConfig["statusMap"]): ProviderJobStatus {
  const raw = String(value ?? "").toLowerCase();
  const defaults: Record<ProviderJobStatus, string[]> = {
    queued: ["queued", "pending", "created"],
    running: ["running", "processing", "in_progress", "starting"],
    completed: ["completed", "succeeded", "success", "done"],
    failed: ["failed", "error", "canceled", "cancelled"],
  };

  for (const state of Object.keys(defaults) as ProviderJobStatus[]) {
    const values = statusMap?.[state] ?? defaults[state];
    if (values.map(item => item.toLowerCase()).includes(raw)) return state;
  }
  return "running";
}

export class HttpJsonVideoProviderAdapter implements VideoProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly adapterType: string;

  constructor(private readonly config: HttpJsonProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.adapterType = config.adapterType ?? "http-json";
  }

  getCapabilities() {
    return this.config.capabilities;
  }

  async checkAvailability() {
    if (!this.config.submitUrl || !this.config.responseMap.idPath) {
      return { available: false, reason: "Provider endpoint mapping is incomplete." };
    }
    if (!this.config.apiKey) {
      return { available: false, reason: "Provider credential is not configured." };
    }
    return { available: true };
  }

  private headers() {
    const header = this.config.apiKeyHeader ?? "Authorization";
    const prefix = this.config.apiKeyPrefix ?? "Bearer ";
    return {
      "Content-Type": "application/json",
      ...this.config.headers,
      [header]: `${prefix}${this.config.apiKey}`,
    };
  }

  private requestBody(request: VideoGenerationRequest) {
    const body: Record<string, unknown> = {};
    const source: Record<RequestField, unknown> = {
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      referenceImages: request.referenceImages.map(image => image.url),
      durationSeconds: request.durationSeconds,
      aspectRatio: request.aspectRatio,
      width: request.width,
      height: request.height,
      seed: request.seed,
      settings: request.settings,
    };
    Object.entries(this.config.requestMap).forEach(([field, path]) => {
      const value = source[field as RequestField];
      if (path && value !== undefined) setPath(body, path, value);
    });
    if (this.config.model && this.config.modelField) setPath(body, this.config.modelField, this.config.model);
    return body;
  }

  private parseJob(payload: unknown): ProviderJob {
    const id = getPath(payload, this.config.responseMap.idPath);
    if (id === undefined || id === null || id === "") {
      throw new Error("Provider response did not include a job identifier.");
    }
    const status = normalizeStatus(getPath(payload, this.config.responseMap.statusPath), this.config.statusMap);
    const rawProgress = Number(getPath(payload, this.config.responseMap.progressPath));
    const output = getPath(payload, this.config.responseMap.outputUrlPath);
    const providerError = getPath(payload, this.config.responseMap.errorPath);
    if (status === "failed" && providerError) throw new Error(String(providerError));
    return {
      externalJobId: String(id),
      status,
      progress: Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : status === "completed" ? 100 : 0,
      outputUrl: typeof output === "string" ? output : undefined,
      providerPayload: payload,
    };
  }

  async submit(request: VideoGenerationRequest) {
    const response = await fetch(this.config.submitUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.requestBody(request)),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
    return this.parseJob(payload);
  }

  async refresh(job: ProviderJob) {
    if (!this.config.statusUrlTemplate) return job;
    const url = this.config.statusUrlTemplate.replace("{id}", encodeURIComponent(job.externalJobId));
    const response = await fetch(url, { headers: this.headers() });
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
