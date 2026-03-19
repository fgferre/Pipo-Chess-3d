export type QualityTier = 1 | 2 | 3;
export type QualityMode = "auto" | "manual";

export interface QualitySettings {
  qualityMode: QualityMode;
  manualQualityTier: QualityTier;
}

export interface QualitySettingsInput {
  qualityMode?: unknown;
  manualQualityTier?: number | null;
}

export interface QualityHardwareProfile {
  renderer: string | null;
  vendor?: string | null;
  deviceMemoryGb: number | null;
  hardwareConcurrency?: number | null;
  isMobile?: boolean;
}

export interface QualityMonitorState {
  lowFpsSinceMs: number | null;
  lastAutoDowngradeAtMs: number | null;
}

export interface QualityMonitorSnapshot {
  currentTier: QualityTier;
  fps: number;
  nowMs: number;
}

export interface QualityMonitorUpdate {
  nextState: QualityMonitorState;
  nextTier: QualityTier | null;
}

export const QUALITY_DEFAULT_TIER: QualityTier = 2;
export const QUALITY_FPS_THRESHOLD = 45;
export const QUALITY_LOW_FPS_DURATION_MS = 3000;
export const QUALITY_AUTO_DOWNGRADE_COOLDOWN_MS = 60_000;

export function clampQualityTier(tier: number | null | undefined): QualityTier {
  if (tier === 3) {
    return 3;
  }

  if (tier === 1) {
    return 1;
  }

  return 2;
}

export function normalizeQualitySettings(
  settings: QualitySettingsInput | null | undefined = {},
): QualitySettings {
  const input = settings ?? {};

  return {
    qualityMode: input.qualityMode === "manual" ? "manual" : "auto",
    manualQualityTier: clampQualityTier(input.manualQualityTier ?? QUALITY_DEFAULT_TIER),
  };
}

export function getLowerQualityTier(tier: QualityTier): QualityTier | null {
  if (tier === 3) {
    return 2;
  }

  if (tier === 2) {
    return 1;
  }

  return null;
}

export function resolveEffectiveQualityTier(
  settings: QualitySettings,
  detectedTier: QualityTier | null | undefined,
): QualityTier {
  if (settings.qualityMode === "manual") {
    return settings.manualQualityTier;
  }

  return clampQualityTier(detectedTier ?? QUALITY_DEFAULT_TIER);
}

export function estimateInitialQualityTier(profile: QualityHardwareProfile): QualityTier {
  const renderer = [profile.renderer, profile.vendor].filter(Boolean).join(" ").toLowerCase();

  if (typeof profile.deviceMemoryGb === "number" && profile.deviceMemoryGb > 0 && profile.deviceMemoryGb < 4) {
    return 1;
  }

  if (
    typeof profile.hardwareConcurrency === "number" &&
    profile.hardwareConcurrency > 0 &&
    profile.hardwareConcurrency <= 4
  ) {
    return 1;
  }

  if (containsAny(renderer, ["intel hd", "mali", "powervr", "adreno 5", "adreno 4", "uhd graphics"])) {
    return 1;
  }

  const highEnd = containsAny(renderer, [
    "rtx",
    "geforce rtx",
    "radeon rx",
    "radeon pro",
    "apple gpu",
    "apple m1",
    "apple m2",
    "apple m3",
    "apple m4",
    "adreno 7",
    "m1",
    "m2",
    "m3",
    "m4",
  ]);
  const midRange = containsAny(renderer, [
    "iris xe",
    "intel iris",
    "arc graphics",
    "adreno 6",
  ]);

  if (highEnd) {
    if (profile.isMobile && (profile.deviceMemoryGb ?? 0) < 8 && (profile.hardwareConcurrency ?? 0) < 8) {
      return 2;
    }

    return 3;
  }

  if (midRange) {
    return 2;
  }

  if (profile.isMobile) {
    return 2;
  }

  if (renderer.length > 0) {
    return 2;
  }

  return QUALITY_DEFAULT_TIER;
}

export function createQualityMonitorState(): QualityMonitorState {
  return {
    lowFpsSinceMs: null,
    lastAutoDowngradeAtMs: null,
  };
}

export function updateQualityMonitorState(
  state: QualityMonitorState,
  snapshot: QualityMonitorSnapshot,
): QualityMonitorUpdate {
  const lowFps = snapshot.fps < QUALITY_FPS_THRESHOLD;
  const lowFpsSinceMs = lowFps ? state.lowFpsSinceMs ?? snapshot.nowMs : null;
  const sustainedLowFps =
    lowFpsSinceMs !== null && snapshot.nowMs - lowFpsSinceMs >= QUALITY_LOW_FPS_DURATION_MS;
  const cooldownReady =
    state.lastAutoDowngradeAtMs === null ||
    snapshot.nowMs - state.lastAutoDowngradeAtMs >= QUALITY_AUTO_DOWNGRADE_COOLDOWN_MS;
  const nextTier = sustainedLowFps && cooldownReady ? getLowerQualityTier(snapshot.currentTier) : null;

  if (nextTier === null) {
    return {
      nextState: {
        lowFpsSinceMs,
        lastAutoDowngradeAtMs: state.lastAutoDowngradeAtMs,
      },
      nextTier: null,
    };
  }

  return {
    nextState: {
      lowFpsSinceMs: snapshot.nowMs,
      lastAutoDowngradeAtMs: snapshot.nowMs,
    },
    nextTier,
  };
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}
