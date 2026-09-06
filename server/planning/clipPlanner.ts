import { invokeLLM, listLLMModels } from "../_core/llm";

export type PlannedClip = {
  title: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  seed?: number;
};

export async function createClipPlan(input: {
  prompt: string;
  targetDurationSeconds: number;
  referenceUrls: string[];
}) {
  const desiredCount = Math.max(8, Math.ceil(input.targetDurationSeconds / 8));
  const { data: models } = await listLLMModels();
  const model = models.find(item => item.id === "gpt-5-mini")?.id ?? models[0]?.id;
  if (!model) throw new Error("No planning model is currently available.");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [
    {
      type: "text",
      text: `Create exactly ${desiredCount} sequential vertical video clips for this creative brief. The assembled timeline must be at least ${input.targetDurationSeconds} seconds. Each clip should be 6-10 seconds, visually continuous, and usable with image-to-video models. Creative brief: ${input.prompt}`,
    },
    ...input.referenceUrls.slice(0, 4).map(url => ({
      type: "image_url" as const,
      image_url: { url, detail: "auto" as const },
    })),
  ];

  const response = await invokeLLM({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a cinematic short-form video director. Produce production-ready, visually specific clip prompts with camera movement, subject continuity, lighting, action, and transition intent. Output only the requested JSON.",
      },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "vertical_video_clip_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            clips: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  prompt: { type: "string" },
                  negativePrompt: { type: "string" },
                  durationSeconds: { type: "integer" },
                  seed: { type: ["integer", "null"] },
                },
                required: ["title", "prompt", "negativePrompt", "durationSeconds", "seed"],
                additionalProperties: false,
              },
            },
          },
          required: ["clips"],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  const parsed = JSON.parse(typeof rawContent === "string" ? rawContent : "{}") as { clips?: PlannedClip[] };
  if (!Array.isArray(parsed.clips) || parsed.clips.length === 0) throw new Error("The planner returned no clips.");

  const clips = parsed.clips.slice(0, desiredCount).map((clip, index) => ({
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

  return { model, clips, totalDurationSeconds: total };
}
