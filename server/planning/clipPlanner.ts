import * as db from "../db";
import { decryptProviderCredential } from "../providers/credentialVault";

export type PlannedClip = {
  title: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
};

type ChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" } };

function parseObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}`;
}

function extractJson(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as { clips?: PlannedClip[] };
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as { clips?: PlannedClip[] };
    throw new Error("The script provider did not return valid plan JSON.");
  }
}

async function requestPlan(input: {
  ownerId: number;
  content: ChatContent[];
}) {
  const connection = await db.getProviderConnectionByKind(input.ownerId, "script");
  if (!connection) throw new Error("Configure a Script writer provider before creating a clip plan.");
  if (!connection.model) throw new Error("Choose a Script writer model before creating a clip plan.");

  const apiKey = decryptProviderCredential(connection.apiKeyEncrypted);
  const headers = parseObject<Record<string, string>>(connection.headersJson, {});
  const response = await fetch(joinUrl(connection.submitUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
      [connection.apiKeyHeader]: `${connection.apiKeyPrefix}${apiKey}`,
    },
    body: JSON.stringify({
      model: connection.model,
      messages: [
        {
          role: "system",
          content: "You are a cinematic short-form video director. Output only valid JSON matching { clips: [{ title, prompt, negativePrompt, durationSeconds, seed }] }. Produce visually specific clip prompts with camera movement, continuity, lighting, action, and transition intent.",
        },
        { role: "user", content: input.content },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Script provider request failed (${response.status}).`);

  let payload: { choices?: Array<{ message?: { content?: unknown } }> };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new Error("Script provider returned a non-JSON response.");
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Script provider returned no completion content.");
  return { providerKey: connection.providerKey, model: connection.model, plan: extractJson(content) };
}

export async function createClipPlan(input: {
  ownerId: number;
  prompt: string;
  targetDurationSeconds: number;
  referenceUrls: string[];
}) {
  const desiredCount = Math.max(8, Math.ceil(input.targetDurationSeconds / 8));
  const content: ChatContent[] = [
    {
      type: "text",
      text: `Create exactly ${desiredCount} sequential vertical video clips for this creative brief. The assembled timeline must be at least ${input.targetDurationSeconds} seconds. Each clip should be 6-10 seconds, visually continuous, and usable with image-to-video models. Creative brief: ${input.prompt}`,
    },
    ...input.referenceUrls.slice(0, 4).map(url => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" as const },
    })),
  ];

  const response = await requestPlan({ ownerId: input.ownerId, content });
  if (!Array.isArray(response.plan.clips) || response.plan.clips.length === 0) throw new Error("The script provider returned no clips.");

  const clips = response.plan.clips.slice(0, desiredCount).map((clip, index) => ({
    title: String(clip.title || `Scene ${index + 1}`).slice(0, 180),
    prompt: String(clip.prompt || input.prompt),
    negativePrompt: String(clip.negativePrompt || "text overlays, logos, watermarks, horizontal framing"),
    durationSeconds: Math.max(6, Math.min(10, Math.round(Number(clip.durationSeconds) || 8))),
    seed: typeof clip.seed === "number" ? Math.max(0, Math.round(clip.seed)) : undefined,
  }));

  while (clips.length < desiredCount) {
    clips.push({
      title: `Continuation ${clips.length + 1}`,
      prompt: `${input.prompt}. Continue the previous shot with consistent subject identity, wardrobe, lighting, and vertical composition.`,
      negativePrompt: "text overlays, logos, watermarks, horizontal framing, continuity errors",
      durationSeconds: 8,
      seed: undefined,
    });
  }

  let total = clips.reduce((sum, clip) => sum + clip.durationSeconds, 0);
  let cursor = 0;
  while (total < input.targetDurationSeconds) {
    const clip = clips[cursor % clips.length]!;
    if (clip.durationSeconds < 12) {
      clip.durationSeconds += 1;
      total += 1;
    }
    cursor += 1;
  }

  return { providerKey: response.providerKey, model: response.model, clips, totalDurationSeconds: total };
}
