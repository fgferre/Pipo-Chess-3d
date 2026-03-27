import type { DifficultyPreset } from "../types/game";

// Stockfish 18 Lite exposes UCI_Elo in the supported interval [1320, 3190].
export const STOCKFISH_UCI_ELO_MIN = 1320;
export const STOCKFISH_UCI_ELO_MAX = 3190;

export function clampSupportedUciElo(uciElo: number): number {
  return Math.min(STOCKFISH_UCI_ELO_MAX, Math.max(STOCKFISH_UCI_ELO_MIN, uciElo));
}

export const difficultyPresets: DifficultyPreset[] = [
  {
    id: "beginner",
    label: "Beginner",
    uciElo: 1320,
    skillLevelFallback: 0,
    moveTimeMs: 150,
    hintTimeMs: 350,
  },
  {
    id: "easy",
    label: "Easy",
    uciElo: 1690,
    skillLevelFallback: 4,
    moveTimeMs: 250,
    hintTimeMs: 450,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    uciElo: 2060,
    skillLevelFallback: 8,
    moveTimeMs: 400,
    hintTimeMs: 650,
  },
  {
    id: "club",
    label: "Club",
    uciElo: 2440,
    skillLevelFallback: 12,
    moveTimeMs: 600,
    hintTimeMs: 850,
  },
  {
    id: "advanced",
    label: "Advanced",
    uciElo: 2810,
    skillLevelFallback: 16,
    moveTimeMs: 900,
    hintTimeMs: 1200,
  },
  {
    id: "master",
    label: "Master",
    uciElo: 3190,
    skillLevelFallback: 19,
    moveTimeMs: 1400,
    hintTimeMs: 1600,
  },
  {
    id: "gm",
    label: "GM",
    uciElo: null,
    skillLevelFallback: 20,
    moveTimeMs: 2500,
    hintTimeMs: 2500,
  },
];

export const defaultDifficultyId = "club";

export function getDifficultyPreset(id: string): DifficultyPreset {
  return (
    difficultyPresets.find((preset) => preset.id === id) ??
    difficultyPresets.find((preset) => preset.id === defaultDifficultyId) ??
    difficultyPresets[0]
  );
}

