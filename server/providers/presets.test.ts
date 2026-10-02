import { describe, expect, it } from "vitest";
import { getPreset, providerPresets } from "./presets";

describe("provider presets", () => {
  it("uses the verified official API bases for script and voice presets", () => {
    expect(getPreset("script", "openrouter").baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(getPreset("script", "kimi-moonshot").baseUrl).toBe("https://api.moonshot.ai/v1");
    expect(getPreset("script", "fireworks-ai").baseUrl).toBe("https://api.fireworks.ai/inference/v1");
    expect(getPreset("script", "openai").baseUrl).toBe("https://api.openai.com/v1");
    expect(getPreset("voice", "elevenlabs").baseUrl).toBe("https://api.elevenlabs.io");
    expect(getPreset("voice", "openai-tts").baseUrl).toBe("https://api.openai.com/v1");
  });

  it("keeps video rendering custom rather than selecting a mandatory vendor", () => {
    expect(providerPresets.filter(item => item.kind === "video").map(item => item.id)).toEqual(["custom-json"]);
  });
});
