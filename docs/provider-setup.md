# StudioCut Provider Settings

StudioCut has no mandatory video renderer. Configure the services you want from **Provider settings** after entering the private studio access key. Credentials are encrypted before database storage, remain server-side, and are never shown again.

## Script writer

This provider creates the structured multi-clip plan from the creative brief and reference images. The application uses the provider's OpenAI-compatible `POST /chat/completions` endpoint.

| Preset | Official API base URL | Official documentation |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | https://openrouter.ai/docs/quickstart |
| Kimi (Moonshot) | `https://api.moonshot.ai/v1` | https://platform.moonshot.ai/docs/api |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | https://docs.fireworks.ai/tools-sdks/openai-compatibility |
| OpenAI | `https://api.openai.com/v1` | https://developers.openai.com/api/reference/overview |
| Custom OpenAI-compatible URL | Enter the provider's base URL | Use that provider's official documentation |

Choose a model available to your account, enter the server-side key, and use **Test connection** before creating a plan.

## Voice (text-to-speech)

Voice settings store and test a TTS provider for a future audio track. They do **not** change the current silent, video-only FFmpeg export.

| Preset | Official API base URL | Model field |
|---|---|---|
| ElevenLabs | `https://api.elevenlabs.io` | A voice ID from the account |
| OpenAI TTS | `https://api.openai.com/v1` | A TTS model such as `gpt-4o-mini-tts` |
| Custom | Enter the provider's base URL | Provider-specific model or voice ID |

## Video clips

The **Custom JSON video provider** is intentionally generic. It accepts a submit endpoint, model, API key, and mapping fields that translate the shared StudioCut request (`prompt`, references, duration, 9:16 aspect ratio, optional seed/settings) into the renderer's JSON format. Add more than one renderer to preserve the primary/fallback order.

A Custom JSON provider needs:

- a submission endpoint;
- an API key/header convention;
- request mappings for the fields the provider needs;
- response mappings for job ID and job status; and
- a polling endpoint/status mapping if the provider completes asynchronously.

Verify those values against the chosen video provider's official documentation. No vendor is selected or required by default.
