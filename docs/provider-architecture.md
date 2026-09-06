# Provider Architecture

The studio uses a **server-only provider registry**. Browser code may select a provider by public identifier and read capability/status metadata, but it never receives credential values. Each adapter converts the studio's normalized project, reference, and clip-plan records into a provider-specific request and converts the provider response into a normalized job state.

| Provider role | Verified capability | Studio responsibility |
| --- | --- | --- |
| Kimi | Kimi's current API accepts text, image, and video **inputs** and produces text or JSON through OpenAI- or Anthropic-compatible APIs. Its documentation does not present a video-output endpoint. | Multimodal scene planner and reference analyst. It can convert a creative brief plus reference images into structured clip prompts, but is not labeled as a video renderer. |
| Fireworks AI | Fireworks' current documentation focuses on text, vision analysis, audio, image, embeddings, model deployment, and asynchronous batch inference. Its public navigation does not present a first-party video-output API. | Optional planning, vision-analysis, or image-generation adapter. It remains separate from the video-rendering capability unless the user configures a compatible hosted endpoint. |
| Compatible non-Google renderer | The studio defines a normalized asynchronous image-to-video contract rather than coupling project records to one vendor. | Optional adapter in an owner-configurable chain. Each adapter submits one short clip per scene, persists the remote operation identifier, refreshes status on demand, and stores the returned MP4 without exposing credentials. No adapter is selected permanently. |

> Long-form output is produced by planning and generating multiple short clips, then ordering them on a timeline whose validated total is at least **61 seconds**. The first implementation keeps provider submission and media assembly request-scoped and persists every state transition, making it compatible with stateless managed hosting. Heavy local transcoding or continuous provider polling may later require an always-on worker or external render service.

> **Google is excluded from video rendering by product requirement.** No Google video model appears as a renderer option, default, fallback, or hidden submission path. Google-related credentials, if ever connected for unrelated services, do not grant the renderer capability.

## Common Provider Contract

Every video adapter implements the same server-side interface. The normalized request contains the scene prompt, optional negative prompt, ordered reference-image URLs, requested clip duration, aspect ratio, optional seed, and an extensible settings map. The normalized response contains a provider-neutral job identifier, lifecycle state, progress, result URL, provider metadata, and a classified error when unsuccessful.

| Operation | Purpose |
| --- | --- |
| `getCapabilities` | Reports supported durations, aspect ratios, reference limits, audio behavior, and optional settings without exposing credentials. |
| `checkAvailability` | Confirms configuration and service readiness before an attempt begins. |
| `submit` | Translates a normalized request into the provider API and returns a normalized remote job. |
| `refresh` | Maps provider-specific queue and operation responses into queued, running, completed, or failed states. |
| `classifyError` | Distinguishes quota, credit, authentication, unavailable, retryable, validation, and fatal failures. |

The project stores either an explicit manual provider choice or `automatic`. Automatic mode resolves the current enabled provider order at submission time. A classified fallback-eligible error advances to the next enabled adapter and records a separate attempt, preserving a complete audit trail. Changing provider order affects future attempts only and does not rewrite historical jobs.

## Normalized Lifecycle

| State | Meaning | Allowed next states |
| --- | --- | --- |
| `queued` | A clip record exists and is waiting for provider submission or provider capacity. | `running`, `failed` |
| `running` | The provider accepted the request and the remote operation is incomplete. | `completed`, `failed` |
| `completed` | A playable generated artifact has been persisted and can be placed on the timeline. | None |
| `failed` | Submission, polling, retrieval, validation, or storage failed with a user-readable reason. | `queued` through an explicit retry |

## Runtime Options

| Approach | Tradeoffs | Cost | Setup complexity |
| --- | --- | --- | --- |
| Managed request-scoped studio | Lowest setup burden; project creation, plan generation, provider submission, manual/on-view status refresh, and lightweight export orchestration work without a continuously running worker. Long media rendering must finish within the hosting request and memory limits or be delegated to a provider. | Free to start, then usage-based. | Low |
| Always-on worker or external render service | Supports continuous job polling and heavier FFmpeg processing without requiring the browser to refresh, but adds a persistent service and additional operating cost. | Higher ongoing compute cost plus provider usage. | Medium to high |

## Sources

1. [Kimi API Platform — Quickstart](https://platform.kimi.ai/docs/overview)
2. [Fireworks AI — Build with Fireworks AI](https://docs.fireworks.ai/getting-started/introduction)
