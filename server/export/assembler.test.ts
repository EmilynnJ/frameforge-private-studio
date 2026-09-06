import { describe, expect, it } from "vitest";
import { assembleVerticalVideo } from "./assembler";

describe("vertical MP4 assembly eligibility", () => {
  it("rejects an empty timeline", async () => {
    await expect(assembleVerticalVideo({ ownerId: 1, projectId: 1, clips: [] })).rejects.toThrow(
      "no completed clips",
    );
  });

  it("rejects a final duration below 61 seconds before downloading media", async () => {
    await expect(
      assembleVerticalVideo({
        ownerId: 1,
        projectId: 1,
        clips: [{ storageKey: "unused.mp4", durationSeconds: 60 }],
      }),
    ).rejects.toThrow("at least 61 seconds");
  });
});
