import { describe, expect, it } from "vitest";
import {
  clampSupportedUciElo,
  difficultyPresets,
  getDifficultyPreset,
  STOCKFISH_UCI_ELO_MAX,
  STOCKFISH_UCI_ELO_MIN,
} from "./difficulties";

describe("difficulty presets", () => {
  it("exposes the seven configured AI levels", () => {
    expect(difficultyPresets).toHaveLength(7);
    expect(getDifficultyPreset("gm").moveTimeMs).toBe(2500);
    expect(getDifficultyPreset("missing").id).toBe("club");
  });

  it("keeps the capped presets inside the engine-supported Elo range", () => {
    const capped = difficultyPresets.filter((preset) => preset.uciElo !== null);
    const elos = capped.map((preset) => preset.uciElo);

    expect(elos).toEqual([1320, 1690, 2060, 2440, 2810, 3190]);
    expect(capped.map((preset) => preset.label)).toEqual([
      "Beginner",
      "Easy",
      "Intermediate",
      "Club",
      "Advanced",
      "Master",
    ]);
    expect(capped.every((preset) => preset.uciElo! >= STOCKFISH_UCI_ELO_MIN)).toBe(true);
    expect(capped.every((preset) => preset.uciElo! <= STOCKFISH_UCI_ELO_MAX)).toBe(true);
    expect(getDifficultyPreset("gm").label).toBe("GM");
  });

  it("clamps unsupported Elo values to the Stockfish interval", () => {
    expect(clampSupportedUciElo(800)).toBe(STOCKFISH_UCI_ELO_MIN);
    expect(clampSupportedUciElo(1600)).toBe(1600);
    expect(clampSupportedUciElo(4000)).toBe(STOCKFISH_UCI_ELO_MAX);
  });
});
