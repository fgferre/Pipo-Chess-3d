import type { DifficultyPreset } from "../types/game";

export const difficultyPresets: DifficultyPreset[] = [
  {
    id: "beginner",
    label: "Beginner",
    uciElo: 800,
    skillLevelFallback: 1,
    moveTimeMs: 150,
    hintTimeMs: 350,
  },
  {
    id: "easy",
    label: "Easy",
    uciElo: 1000,
    skillLevelFallback: 3,
    moveTimeMs: 250,
    hintTimeMs: 450,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    uciElo: 1300,
    skillLevelFallback: 6,
    moveTimeMs: 400,
    hintTimeMs: 650,
  },
  {
    id: "club",
    label: "Club",
    uciElo: 1600,
    skillLevelFallback: 9,
    moveTimeMs: 600,
    hintTimeMs: 850,
  },
  {
    id: "advanced",
    label: "Advanced",
    uciElo: 1900,
    skillLevelFallback: 13,
    moveTimeMs: 900,
    hintTimeMs: 1200,
  },
  {
    id: "master",
    label: "Master",
    uciElo: 2200,
    skillLevelFallback: 18,
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

