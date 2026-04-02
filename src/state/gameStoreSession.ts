import {
  createDefaultSettings,
  createNewSession,
  getCurrentRepetitionCount,
  getFiftyMoveRulePressure,
  getLowTimeState,
  hydrateSession,
  setSessionSettings,
} from "../game/gameService";
import { t } from "../i18n";
import { normalizeQualitySettings, type QualityMode, type QualityTier } from "../quality/qualityPolicy";
import type { CameraPreset, Locale, NewGameOptions } from "../types/game";
import type { GameStore, GameStoreGet, GameStoreSet, QualitySession, QualitySettings } from "./gameStoreTypes";

function normalizeSessionSettings(settings: Partial<QualitySettings>): QualitySettings {
  const defaults = createDefaultSettings();
  const qualitySettings = normalizeQualitySettings(settings);

  return {
    ...defaults,
    ...settings,
    qualityMode: qualitySettings.qualityMode,
    manualQualityTier: qualitySettings.manualQualityTier,
  };
}

export function createQualitySession(
  settings: Partial<QualitySettings>,
  options: { playerColor?: "w" | "b" } = {},
): QualitySession {
  const normalized = normalizeSessionSettings(settings);
  return createNewSession(normalized, options);
}

export function hydrateQualitySession(
  session: QualitySession,
  fallbackSettings: Partial<QualitySettings>,
): QualitySession {
  const normalizedFallback = normalizeSessionSettings(fallbackSettings);
  return hydrateSession(session, normalizedFallback);
}

function updateSessionSettings(
  session: QualitySession,
  patch: Partial<QualitySettings>,
): QualitySession {
  const nextSettings: QualitySettings = {
    ...session.settings,
    ...patch,
  };

  return setSessionSettings(session, nextSettings);
}

function buildSessionIndicators(session: QualitySession): Pick<
  GameStore,
  "currentRepetitionCount" | "fiftyMoveRulePressure" | "lowTimeState"
> {
  return {
    currentRepetitionCount: getCurrentRepetitionCount(session),
    fiftyMoveRulePressure: getFiftyMoveRulePressure(session),
    lowTimeState: getLowTimeState(session),
  };
}

export function buildSessionPatch(session: QualitySession): Pick<
  GameStore,
  "session" | "currentRepetitionCount" | "fiftyMoveRulePressure" | "lowTimeState"
> {
  return {
    session,
    ...buildSessionIndicators(session),
  };
}

export function buildSelectionResetPatch(): Pick<
  GameStore,
  "selectedSquare" | "legalTargets" | "castlingTargets" | "hintMove"
> {
  return {
    selectedSquare: null,
    legalTargets: [],
    castlingTargets: [],
    hintMove: null,
  };
}

export function buildSessionResetPatch(
  session: QualitySession,
  extras: Partial<GameStore> = {},
): Partial<GameStore> {
  return {
    ...buildSessionPatch(session),
    ...buildSelectionResetPatch(),
    pendingPromotion: null,
    analysisCursor: null,
    analysisAutoplay: false,
    analysisProgress: null,
    restoreNotice: null,
    lastError: null,
    ...extras,
  };
}

export function getPositionSignature(session: QualitySession): string {
  return `${session.snapshot.fen}|${session.moveEntries.length}|${session.settings.difficultyId}|${session.snapshot.status}`;
}

export function getDefaultCameraPreset(session: QualitySession): CameraPreset {
  return session.settings.defaultViewMode === "2d" ? "2d" : "classic";
}

export function resolveNewGamePlayerColor(choice: NewGameOptions["playerColor"]): "w" | "b" {
  if (choice === "black") {
    return "b";
  }

  if (choice === "random") {
    return Math.random() < 0.5 ? "w" : "b";
  }

  return "w";
}

export function normalizeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function resolveStoreErrorMessage(
  locale: Locale,
  error: unknown,
  fallbackKey: Parameters<typeof t>[1],
): string {
  if (fallbackKey === "engine.error" && error instanceof Error && error.message === "Engine response timed out") {
    return t(locale, "engine.timeout");
  }

  return normalizeErrorMessage(error, t(locale, fallbackKey));
}

export function setStoreError(
  set: GameStoreSet,
  locale: Locale,
  error: unknown,
  fallbackKey: Parameters<typeof t>[1],
): void {
  set({
    lastError: resolveStoreErrorMessage(locale, error, fallbackKey),
  });
}

type PersistNow = () => Promise<void>;
type ScheduleLater = () => void;

export function createSettingsActions({
  get,
  set,
  persistLiveSettings,
  persistLiveAutosave,
  scheduleCameraSensitivityPersistence,
}: {
  get: GameStoreGet;
  set: GameStoreSet;
  persistLiveSettings: PersistNow;
  persistLiveAutosave: PersistNow;
  scheduleCameraSensitivityPersistence: ScheduleLater;
}): Pick<
  GameStore,
  | "setTheme"
  | "setLocale"
  | "toggleOrientation"
  | "setShowCoordinates"
  | "setAnimationMode"
  | "setDefaultViewMode"
  | "setCameraSensitivity"
  | "setQualityMode"
  | "setQualityTier"
  | "setSoundEnabled"
  | "setSoundVolume"
  | "setHapticsEnabled"
> {
  const persistSessionChange = async (session: QualitySession, extras: Partial<GameStore> = {}) => {
    set({
      ...buildSessionPatch(session),
      lastError: null,
      ...extras,
    });
    await persistLiveSettings();
    await persistLiveAutosave();
  };

  const updateAndPersist = async (patch: Partial<QualitySettings>, extras: Partial<GameStore> = {}) => {
    const nextSession = updateSessionSettings(get().session, patch);
    await persistSessionChange(nextSession, extras);
  };

  return {
    setTheme: async (themeId) => {
      await updateAndPersist({ themeId });
    },

    setLocale: async (locale) => {
      await updateAndPersist({ locale });
    },

    toggleOrientation: async () => {
      const orientation = get().session.settings.orientation === "white" ? "black" : "white";
      await updateAndPersist({ orientation });
    },

    setShowCoordinates: async (show) => {
      await updateAndPersist({ showCoordinates: show });
    },

    setAnimationMode: async (mode) => {
      await updateAndPersist({ animationMode: mode });
    },

    setDefaultViewMode: async (mode) => {
      const cameraPreset = mode === "2d" ? "2d" : "classic";
      await updateAndPersist({ defaultViewMode: mode }, { cameraPreset });
    },

    setCameraSensitivity: async (cameraSensitivity) => {
      const nextSession = updateSessionSettings(get().session, { cameraSensitivity });
      set({ ...buildSessionPatch(nextSession), lastError: null });
      scheduleCameraSensitivityPersistence();
    },

    setQualityMode: async (mode: QualityMode) => {
      await updateAndPersist({ qualityMode: mode });
    },

    setQualityTier: async (tier: QualityTier) => {
      await updateAndPersist({
        qualityMode: "manual",
        manualQualityTier: tier,
      });
    },

    setSoundEnabled: async (enabled) => {
      await updateAndPersist({ soundEnabled: enabled });
    },

    setSoundVolume: async (volume) => {
      await updateAndPersist({ soundVolume: volume });
    },

    setHapticsEnabled: async (enabled) => {
      await updateAndPersist({ hapticsEnabled: enabled });
    },
  };
}
