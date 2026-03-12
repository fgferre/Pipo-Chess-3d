import { describe, expect, it } from "vitest";
import { difficultyPresets, getDifficultyPreset } from "./difficulties";

describe("difficulty presets", () => {
  it("exposes the seven configured AI levels", () => {
    expect(difficultyPresets).toHaveLength(7);
    expect(getDifficultyPreset("gm").moveTimeMs).toBe(2500);
    expect(getDifficultyPreset("missing").id).toBe("club");
  });
});
