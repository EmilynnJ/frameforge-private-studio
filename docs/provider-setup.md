# Video Provider Setup

FrameForge intentionally ships with **no mandatory video renderer**. The app, database, timeline, jobs, and export workflow use a common provider-neutral contract. A renderer becomes available only when its adapter configuration is supplied through the server secret named `VIDEO_PROVIDER_CONFIG_JSON`.

## Configuration Flow

Provider credentials must be added through the project's secure secret settings. The browser never receives `VIDEO_PROVIDER_CONFIG_JSON`, an API key, an authorization header, or a provider response containing those values. After the secret changes, restart the development service or publish a new project version so the server registry reloads its adapters.

| Stage | Behavior |
| --- | --- |
| Server startup | The registry parses the configured adapter array. Invalid entries are logged server-side and are not exposed to the browser. |
| Provider screen | The owner sees only the adapter label, capability metadata, enabled state, order, and redacted availability reason. |
| Automatic project | Enabled providers are attempted in the saved order. Each attempt becomes a durable job record. |
| Manual project | Only the selected adapter is used for that project. The provider chain is not consulted. |
| Failure | Quota, credit, rate-limit, unavailable, retryable, and unknown service failures may advance to the next provider. Authentication and request-validation failures stop because another provider should not silently change an invalid request or conceal a credential problem. |

## Server Secret Shape

The secret value is a JSON array. The following example shows the contract with placeholders only; it is not tied to a vendor or model.

```json
[
  {
    "id": "renderer-a",
    "label": "My Primary Renderer",
    "adapterType": "http-json",
    "submitUrl": "https://api.provider.example/v1/video/jobs",
    "statusUrlTemplate": "https://api.provider.example/v1/video/jobs/{id}",
    "apiKey": "REPLACE_INSIDE_THE_SECRET_MANAGER",
    "apiKeyHeader": "Authorization",
    "apiKeyPrefix": "Bearer ",
    "model": "provider-model-id",
    "modelField": "model",
    "requestMap": {
      "prompt": "input.prompt",
      "negativePrompt": "input.negative_prompt",
      "referenceImages": "input.reference_images",
      "durationSeconds": "input.duration",
      "aspectRatio": "input.aspect_ratio",
      "width": "input.width",
      "height": "input.height",
      "seed": "input.seed",
      "settings": "input.settings"
    },
    "responseMap": {
      "idPath": "job.id",
      "statusPath": "job.status",
      "progressPath": "job.progress",
      "outputUrlPath": "job.output_url",
      "errorPath": "job.error"
    },
    "statusMap": {
      "queued": ["queued", "pending"],
      "running": ["running", "processing"],
      "completed": ["completed", "succeeded"],
      "failed": ["failed", "canceled"]
    },
    "capabilities": {
      "aspectRatios": ["9:16"],
      "minDurationSeconds": 1,
      "maxDurationSeconds": 12,
      "maxReferenceImages": 4,
      "supportsSeed": true,
      "supportsNegativePrompt": true,
      "supportsNativeAudio": false
    }
  }
]
```

The `requestMap` translates FrameForge fields into nested provider fields. The `responseMap` translates provider job responses back into normalized identifiers, progress, status, output, and errors. This mapping is suitable for asynchronous JSON APIs that accept a submission request and expose a status endpoint. A provider with a materially different protocol can be implemented as another class conforming to `VideoProviderAdapter` without changing any project or timeline records.

## Common Request Contract

| Field | Meaning |
| --- | --- |
| `prompt` | Production-ready scene direction generated from the project brief. |
| `negativePrompt` | Optional unwanted elements and continuity failures. |
| `referenceImages` | Temporary signed URLs for owner-owned reference assets. |
| `durationSeconds` | Requested duration for one timeline clip. |
| `aspectRatio` | Fixed to `9:16` for this studio. |
| `width` and `height` | Fixed to `1080 × 1920` in the normalized contract. |
| `seed` | Optional deterministic seed when the adapter supports it. |
| `settings` | Extensible provider-specific options that do not alter the shared schema. |

## Export Runtime

The app assembles completed clips with FFmpeg into a silent H.264 MP4 at 1080 × 1920 and refuses to complete an export shorter than 61 seconds. This first version runs assembly within one server request, caps each stored generated clip at 75 MB, caps the final MP4 at 150 MB, and enforces a render timeout. That approach is simpler and suitable for a personal studio, but long or high-bitrate projects may exceed the managed runtime's memory or request limits.

| Approach | Tradeoffs | Cost | Setup complexity |
| --- | --- | --- | --- |
| Built-in request-scoped assembly | Already implemented, private, and operational without a separate worker. Best for modest clip sizes and personal use. | Managed hosting usage plus provider charges. | Low |
| Always-on or external render worker | Better for large files, long encodes, continuous polling, and retries, but introduces another service and operating cost. | Additional compute plus provider charges. | Medium to high |

The current architecture keeps provider polling owner-triggered or page-triggered, with every state persisted. This avoids relying on an invisible background process. A persistent worker can be added later without changing the normalized provider request or project history model.
