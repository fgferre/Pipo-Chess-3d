import { MeshPhysicalMaterial, MeshStandardMaterial } from "three";
import {
  clampQualityTier,
  createQualityMonitorState as createSharedQualityMonitorState,
  estimateInitialQualityTier,
  normalizeQualitySettings,
  resolveEffectiveQualityTier,
  updateQualityMonitorState as updateSharedQualityMonitorState,
  QUALITY_FPS_THRESHOLD,
  type QualityHardwareProfile,
  type QualityMonitorState as SharedQualityMonitorState,
  type QualityMonitorUpdate,
  type QualityMode as SharedQualityMode,
  type QualitySettings,
  type QualityTier as SharedQualityTier,
} from "../quality/qualityPolicy";

export { clampQualityTier, QUALITY_FPS_THRESHOLD };
export type QualityTier = SharedQualityTier;
export type QualityMode = SharedQualityMode;
export type QualityMonitorState = SharedQualityMonitorState;
export interface QualityPreference extends QualitySettings {}
export interface QualityHardwareProbe extends QualityHardwareProfile {
  vendor: string | null;
  hardwareConcurrency: number | null;
  isMobile: boolean;
}

export interface QualityMaterialTuning {
  bumpScale: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
}

export interface QualityTierProfile {
  pixelRatioCap: number;
  textureAnisotropy: number;
  shadowMapEnabled: boolean;
  shadowMapSize: number;
  shadowRadiusPrimary: number;
  shadowRadiusRim: number;
  hemisphereIntensity: number;
  bloomEnabled: boolean;
  bloomResolutionScale: number;
  postProcessSamples: number;
  postProcessFxaa: boolean;
  usePhysicalMaterials: boolean;
  boardLight: QualityMaterialTuning;
  boardDark: QualityMaterialTuning;
  boardFrame: QualityMaterialTuning;
  boardAccent: QualityMaterialTuning;
  pieceWhite: QualityMaterialTuning;
  pieceBlack: QualityMaterialTuning;
}

const QUALITY_TIER_PROFILES: Record<QualityTier, QualityTierProfile> = {
  1: {
    pixelRatioCap: 1,
    textureAnisotropy: 1,
    shadowMapEnabled: false,
    shadowMapSize: 0,
    shadowRadiusPrimary: 0,
    shadowRadiusRim: 0,
    hemisphereIntensity: 0.38,
    bloomEnabled: false,
    bloomResolutionScale: 0,
    postProcessSamples: 0,
    postProcessFxaa: false,
    usePhysicalMaterials: false,
    boardLight: {
      bumpScale: 0.022,
      roughness: 0.92,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.42,
    },
    boardDark: {
      bumpScale: 0.022,
      roughness: 0.94,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.42,
    },
    boardFrame: {
      bumpScale: 0.024,
      roughness: 0.95,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.38,
    },
    boardAccent: {
      bumpScale: 0.01,
      roughness: 0.86,
      metalness: 0.02,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.55,
    },
    pieceWhite: {
      bumpScale: 0.018,
      roughness: 0.84,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.55,
    },
    pieceBlack: {
      bumpScale: 0.018,
      roughness: 0.86,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 1,
      envMapIntensity: 0.5,
    },
  },
  2: {
    pixelRatioCap: 1.5,
    textureAnisotropy: 4,
    shadowMapEnabled: true,
    shadowMapSize: 2048,
    shadowRadiusPrimary: 4,
    shadowRadiusRim: 2,
    hemisphereIntensity: 0.45,
    bloomEnabled: true,
    bloomResolutionScale: 0.5,
    postProcessSamples: 0,
    postProcessFxaa: true,
    usePhysicalMaterials: false,
    boardLight: {
      bumpScale: 0.03,
      roughness: 0.72,
      metalness: 0.01,
      clearcoat: 0.08,
      clearcoatRoughness: 0.92,
      envMapIntensity: 0.68,
    },
    boardDark: {
      bumpScale: 0.03,
      roughness: 0.74,
      metalness: 0.01,
      clearcoat: 0.08,
      clearcoatRoughness: 0.92,
      envMapIntensity: 0.66,
    },
    boardFrame: {
      bumpScale: 0.032,
      roughness: 0.76,
      metalness: 0.02,
      clearcoat: 0.12,
      clearcoatRoughness: 0.84,
      envMapIntensity: 0.62,
    },
    boardAccent: {
      bumpScale: 0.016,
      roughness: 0.58,
      metalness: 0.08,
      clearcoat: 0.18,
      clearcoatRoughness: 0.72,
      envMapIntensity: 0.82,
    },
    pieceWhite: {
      bumpScale: 0.022,
      roughness: 0.62,
      metalness: 0.02,
      clearcoat: 0.18,
      clearcoatRoughness: 0.78,
      envMapIntensity: 0.72,
    },
    pieceBlack: {
      bumpScale: 0.022,
      roughness: 0.66,
      metalness: 0.02,
      clearcoat: 0.18,
      clearcoatRoughness: 0.78,
      envMapIntensity: 0.68,
    },
  },
  3: {
    pixelRatioCap: 2,
    textureAnisotropy: 16,
    shadowMapEnabled: true,
    shadowMapSize: 4096,
    shadowRadiusPrimary: 8,
    shadowRadiusRim: 4,
    hemisphereIntensity: 0.5,
    bloomEnabled: true,
    bloomResolutionScale: 1,
    postProcessSamples: 4,
    postProcessFxaa: true,
    usePhysicalMaterials: true,
    boardLight: {
      bumpScale: 0.036,
      roughness: 0.64,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.78,
      envMapIntensity: 0.88,
    },
    boardDark: {
      bumpScale: 0.036,
      roughness: 0.66,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.78,
      envMapIntensity: 0.84,
    },
    boardFrame: {
      bumpScale: 0.04,
      roughness: 0.68,
      metalness: 0.03,
      clearcoat: 0.24,
      clearcoatRoughness: 0.68,
      envMapIntensity: 0.82,
    },
    boardAccent: {
      bumpScale: 0.018,
      roughness: 0.48,
      metalness: 0.12,
      clearcoat: 0.3,
      clearcoatRoughness: 0.58,
      envMapIntensity: 1,
    },
    pieceWhite: {
      bumpScale: 0.026,
      roughness: 0.52,
      metalness: 0.03,
      clearcoat: 0.32,
      clearcoatRoughness: 0.54,
      envMapIntensity: 0.92,
    },
    pieceBlack: {
      bumpScale: 0.026,
      roughness: 0.56,
      metalness: 0.03,
      clearcoat: 0.32,
      clearcoatRoughness: 0.54,
      envMapIntensity: 0.9,
    },
  },
};

export function createDefaultQualityPreference(): QualityPreference {
  return normalizeQualitySettings();
}

export function createQualityMonitorState(): QualityMonitorState {
  return createSharedQualityMonitorState();
}

export function normalizeQualityPreference(
  preference: Partial<QualityPreference> | null | undefined = {},
): QualityPreference {
  return normalizeQualitySettings(preference);
}

export function resolveQualityTier(
  preference: QualityPreference,
  detectedTier: QualityTier,
): QualityTier {
  return resolveEffectiveQualityTier(preference, detectedTier);
}

export function getQualityTierProfile(tier: QualityTier): QualityTierProfile {
  return QUALITY_TIER_PROFILES[tier];
}

export function updateQualityMonitorStateForSampleWindow(
  state: QualityMonitorState,
  snapshot: {
    currentTier: QualityTier;
    fps: number;
    nowMs: number;
    sampleWindowMs: number;
  },
): QualityMonitorUpdate {
  const lowFpsWindowStartedAt =
    snapshot.fps < QUALITY_FPS_THRESHOLD ? snapshot.nowMs - snapshot.sampleWindowMs : null;
  const seededState =
    lowFpsWindowStartedAt !== null && state.lowFpsSinceMs === null
      ? {
          ...state,
          lowFpsSinceMs: lowFpsWindowStartedAt,
        }
      : state;

  return updateSharedQualityMonitorState(seededState, {
    currentTier: snapshot.currentTier,
    fps: snapshot.fps,
    nowMs: snapshot.nowMs,
  });
}

export function createQualityHardwareProbe(
  renderer: string | null,
  vendor: string | null,
  deviceMemoryGb: number | null,
  hardwareConcurrency: number | null,
  isMobile: boolean,
): QualityHardwareProbe {
  return { renderer, vendor, deviceMemoryGb, hardwareConcurrency, isMobile };
}

export function getInitialQualityTier(probe: QualityHardwareProbe): QualityTier {
  return estimateInitialQualityTier(probe);
}

export function createTieredMaterial(
  usePhysicalMaterials: boolean,
  color: number,
  tuning: QualityMaterialTuning,
): MeshStandardMaterial | MeshPhysicalMaterial {
  if (usePhysicalMaterials) {
    return new MeshPhysicalMaterial({
      color,
      roughness: tuning.roughness,
      metalness: tuning.metalness,
      clearcoat: tuning.clearcoat,
      clearcoatRoughness: tuning.clearcoatRoughness,
      envMapIntensity: tuning.envMapIntensity,
    });
  }

  return new MeshStandardMaterial({
    color,
    roughness: tuning.roughness,
    metalness: tuning.metalness,
    envMapIntensity: tuning.envMapIntensity,
  });
}
