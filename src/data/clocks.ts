import type { ClockConfig } from "../types/game";

export const clockPresets: ClockConfig[] = [
  { enabled: false, label: "No clock", baseMs: 0, incrementMs: 0 },
  { enabled: true, label: "1 + 0", baseMs: 60_000, incrementMs: 0 },
  { enabled: true, label: "3 + 2", baseMs: 180_000, incrementMs: 2_000 },
  { enabled: true, label: "5 + 0", baseMs: 300_000, incrementMs: 0 },
  { enabled: true, label: "10 + 5", baseMs: 600_000, incrementMs: 5_000 },
  { enabled: true, label: "15 + 10", baseMs: 900_000, incrementMs: 10_000 },
  { enabled: true, label: "30 + 0", baseMs: 1_800_000, incrementMs: 0 },
];

export const defaultClockConfig = clockPresets[3];

export function normalizeClockConfig(config?: Partial<ClockConfig>): ClockConfig {
  if (!config) {
    return defaultClockConfig;
  }

  return {
    enabled: config.enabled ?? defaultClockConfig.enabled,
    label: config.label ?? `${Math.round((config.baseMs ?? 0) / 60_000)} + ${Math.round((config.incrementMs ?? 0) / 1_000)}`,
    baseMs: config.baseMs ?? defaultClockConfig.baseMs,
    incrementMs: config.incrementMs ?? defaultClockConfig.incrementMs,
  };
}

