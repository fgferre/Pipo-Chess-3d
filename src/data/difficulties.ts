import type { DifficultyPreset } from "../types/game";

// Stockfish 18 Lite exposes UCI_Elo in the supported interval [1320, 3190].
export const STOCKFISH_UCI_ELO_MIN = 1320;
export const STOCKFISH_UCI_ELO_MAX = 3190;

export function clampSupportedUciElo(uciElo: number): number {
  return Math.min(STOCKFISH_UCI_ELO_MAX, Math.max(STOCKFISH_UCI_ELO_MIN, uciElo));
}

function formatDifficultyLabel(uciElo: number | null): string {
  return uciElo === null ? "MAX" : `${uciElo} Elo`;
}

export const difficultyPresets: DifficultyPreset[] = [
  {
    id: "beginner",
    label: formatDifficultyLabel(1320),
    uciElo: 1320,
    skillLevelFallback: 0,
    moveTimeMs: 150,
    hintTimeMs: 350,
  },
  {
    id: "easy",
    label: formatDifficultyLabel(1690),
    uciElo: 1690,
    skillLevelFallback: 4,
    moveTimeMs: 250,
    hintTimeMs: 450,
  },
  {
    id: "intermediate",
    label: formatDifficultyLabel(2060),
    uciElo: 2060,
    skillLevelFallback: 8,
    moveTimeMs: 400,
    hintTimeMs: 650,
  },
  {
    id: "club",
    label: formatDifficultyLabel(2440),
    uciElo: 2440,
    skillLevelFallback: 12,
    moveTimeMs: 600,
    hintTimeMs: 850,
  },
  {
    id: "advanced",
    label: formatDifficultyLabel(2810),
    uciElo: 2810,
    skillLevelFallback: 16,
    moveTimeMs: 900,
    hintTimeMs: 1200,
  },
  {
    id: "master",
    label: formatDifficultyLabel(3190),
    uciElo: 3190,
    skillLevelFallback: 19,
    moveTimeMs: 1400,
    hintTimeMs: 1600,
  },
  {
    id: "gm",
    label: formatDifficultyLabel(null),
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

