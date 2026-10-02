export type ConnectionKind = "script" | "voice" | "video";

type PresetDefinition = {
  id: string;
  label: string;
  kind: ConnectionKind;
  baseUrl: string;
  apiKeyHeader: string;
  apiKeyPrefix: string;
  docsUrl: string;
  supportsConnectionTest: boolean;
  customBaseUrl?: boolean;
};

export const providerPresets: PresetDefinition[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "script",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "https://openrouter.ai/docs/quickstart",
    supportsConnectionTest: true,
  },
  {
    id: "kimi-moonshot",
    label: "Kimi (Moonshot)",
    kind: "script",
    baseUrl: "https://api.moonshot.ai/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "https://platform.moonshot.ai/docs/api",
    supportsConnectionTest: true,
  },
  {
    id: "fireworks-ai",
    label: "Fireworks AI",
    kind: "script",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "https://docs.fireworks.ai/tools-sdks/openai-compatibility",
    supportsConnectionTest: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "script",
    baseUrl: "https://api.openai.com/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "https://developers.openai.com/api/reference/overview",
    supportsConnectionTest: true,
  },
  {
    id: "custom-openai-compatible",
    label: "Custom OpenAI-compatible URL",
    kind: "script",
    baseUrl: "",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "",
    supportsConnectionTest: true,
    customBaseUrl: true,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    kind: "voice",
    baseUrl: "https://api.elevenlabs.io",
    apiKeyHeader: "xi-api-key",
    apiKeyPrefix: "",
    docsUrl: "https://elevenlabs.io/docs/api-reference/authentication",
    supportsConnectionTest: true,
  },
  {
    id: "openai-tts",
    label: "OpenAI TTS",
    kind: "voice",
    baseUrl: "https://api.openai.com/v1",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create",
    supportsConnectionTest: true,
  },
  {
    id: "custom-voice",
    label: "Custom",
    kind: "voice",
    baseUrl: "",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "",
    supportsConnectionTest: true,
    customBaseUrl: true,
  },
  {
    id: "custom-json",
    label: "Custom JSON video provider",
    kind: "video",
    baseUrl: "",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
    docsUrl: "",
    supportsConnectionTest: true,
    customBaseUrl: true,
  },
];

export function getPreset(kind: ConnectionKind, preset: string) {
  const definition = providerPresets.find(item => item.kind === kind && item.id === preset);
  if (!definition) throw new Error("Unsupported provider preset.");
  return definition;
}

export function publicPresets() {
  return providerPresets.map(({ apiKeyHeader, apiKeyPrefix, ...preset }) => ({ ...preset, apiKeyHeader, apiKeyPrefix }));
}
