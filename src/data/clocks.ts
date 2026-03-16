import type { ClockConfig } from "../types/game";

export const clockPresets: ClockConfig[] = [
  { enabled: false, label: "No clock", baseMs: 0, incrementMs: 0 },
  { enabled: true, label: "5 min", baseMs: 300_000, incrementMs: 0 },
  { enabled: true, label: "10 min", baseMs: 600_000, incrementMs: 0 },
  { enabled: true, label: "15 min", baseMs: 900_000, incrementMs: 0 },
  { enabled: true, label: "30 min", baseMs: 1_800_000, incrementMs: 0 },
];

export const defaultClockConfig = clockPresets[2];

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
