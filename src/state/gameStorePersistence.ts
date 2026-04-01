import {
  clearAutosave,
  createSaveSlot as persistSaveSlot,
  deleteSaveSlot as removeSaveSlot,
  listSaveSlots,
  loadBootstrapData,
  loadSaveSlot,
  persistAutosave,
  persistSettings,
} from "../persistence/db";
import { createDefaultSettings, pauseClock, resumeClock, sessionFromPgn, withClockState } from "../game/gameService";
import { t } from "../i18n";
import type { AutosaveRecord, SaveSlotRecord } from "../types/game";
import type { GameStore, GameStoreGet, GameStoreSet, QualitySession } from "./gameStoreTypes";
import {
  buildSessionResetPatch,
  createQualitySession,
  getDefaultCameraPreset,
  hydrateQualitySession,
  normalizeErrorMessage,
  setStoreError,
} from "./gameStoreSession";

let cameraSensitivityPersistTimeout: number | null = null;

export async function loadGameStoreBootstrapState(): Promise<{
  liveSession: QualitySession;
  autosave: AutosaveRecord | null;
  saveSlots: SaveSlotRecord[];
  restoreNotice: string | null;
  lastError: string | null;
}> {
  const defaults = createDefaultSettings();
  let liveSession = createQualitySession(defaults);
  let autosave: AutosaveRecord | null = null;
  let saveSlots: SaveSlotRecord[] = [];
  let lastError: string | null = null;
  let restoreNotice: string | null = null;

  try {
    const bootstrapData = await loadBootstrapData();
    const settings = bootstrapData.settings ?? defaults;
    autosave = bootstrapData.autosave;
    saveSlots = bootstrapData.saves;

    if (autosave) {
      try {
        liveSession = resumePersistedSession(hydrateQualitySession(autosave.session, settings));
        restoreNotice = t(liveSession.settings.locale, "toast.autosaveRestored");
      } catch (error) {
        autosave = null;
        liveSession = createQualitySession(settings);
        lastError = normalizeErrorMessage(error, t(settings.locale, "save.restoreError"));
        await clearAutosave().catch(() => undefined);
      }
    } else {
      liveSession = createQualitySession(settings);
    }
  } catch (error) {
    liveSession = createQualitySession(defaults);
    autosave = null;
    saveSlots = [];
    lastError = normalizeErrorMessage(error, t(defaults.locale, "save.restoreError"));
  }

  return {
    liveSession,
    autosave,
    saveSlots,
    restoreNotice,
    lastError,
  };
}

function createPersistedSessionSnapshot(session: QualitySession): QualitySession {
  return withClockState(session, pauseClock(session.snapshot.clockState));
}

function resumePersistedSession(session: QualitySession): QualitySession {
  const clockState = {
    ...session.snapshot.clockState,
    running: false,
    lastTickAt: null,
  };

  return withClockState(session, resumeClock(clockState));
}

export async function persistAutosaveSnapshot(session: QualitySession): Promise<AutosaveRecord> {
  return persistAutosave(createPersistedSessionSnapshot(session));
}

export async function persistSessionSettings(settings: QualitySession["settings"]): Promise<void> {
  await persistSettings(settings);
}

export function scheduleDeferredPersistence(callback: () => void): void {
  if (cameraSensitivityPersistTimeout !== null) {
    window.clearTimeout(cameraSensitivityPersistTimeout);
  }

  cameraSensitivityPersistTimeout = window.setTimeout(() => {
    cameraSensitivityPersistTimeout = null;
    callback();
  }, 180);
}

type PersistNow = () => Promise<void>;

export function createPersistenceActions({
  get,
  set,
  interruptEngineWork,
  clearTrackedAnalysis,
  runAnalysis,
  persistLiveAutosave,
  persistLiveSettings,
}: {
  get: GameStoreGet;
  set: GameStoreSet;
  interruptEngineWork: () => Promise<void>;
  clearTrackedAnalysis: () => void;
  runAnalysis: () => Promise<void>;
  persistLiveAutosave: PersistNow;
  persistLiveSettings: PersistNow;
}): Pick<
  GameStore,
  | "createManualSave"
  | "loadManualSave"
  | "restoreAutosave"
  | "deleteManualSave"
  | "importPgnText"
  | "persistCurrentAutosave"
> {
  return {
    createManualSave: async () => {
      const state = get();
      const label = `${t(state.session.settings.locale, "save.labelPrefix")} ${String(
        state.saveSlots.length + 1,
      ).padStart(2, "0")}`;

      try {
        await persistSaveSlot(createPersistedSessionSnapshot(state.session), label);
        const saves = await listSaveSlots();
        set({ saveSlots: saves, lastError: null });
      } catch (error) {
        setStoreError(set, state.session.settings.locale, error, "save.persistError");
      }

      await persistLiveAutosave();
    },

    loadManualSave: async (id) => {
      await interruptEngineWork();

      try {
        const record = await loadSaveSlot(id);
        if (!record) {
          return;
        }

        clearTrackedAnalysis();
        const nextSession = resumePersistedSession(hydrateQualitySession(record.session, get().session.settings));
        set({
          ...buildSessionResetPatch(nextSession, {
            cameraPreset: getDefaultCameraPreset(nextSession),
          }),
        });
        await persistLiveAutosave();
      } catch (error) {
        setStoreError(set, get().session.settings.locale, error, "save.restoreError");
      }
    },

    restoreAutosave: async () => {
      const autosave = get().autosave;
      if (!autosave) {
        return;
      }

      await interruptEngineWork();

      try {
        clearTrackedAnalysis();
        const nextSession = resumePersistedSession(hydrateQualitySession(autosave.session, get().session.settings));
        set({
          ...buildSessionResetPatch(nextSession, {
            cameraPreset: getDefaultCameraPreset(nextSession),
            restoreNotice: t(nextSession.settings.locale, "toast.autosaveRestored"),
          }),
        });
        await persistLiveAutosave();
      } catch (error) {
        setStoreError(set, get().session.settings.locale, error, "save.restoreError");
      }
    },

    deleteManualSave: async (id) => {
      try {
        await removeSaveSlot(id);
        const saves = await listSaveSlots();
        set({ saveSlots: saves, lastError: null });
      } catch (error) {
        setStoreError(set, get().session.settings.locale, error, "save.persistError");
      }
    },

    importPgnText: async (pgn) => {
      await interruptEngineWork();

      const nextSession = sessionFromPgn(pgn, get().session.settings);
      clearTrackedAnalysis();
      set({
        ...buildSessionResetPatch(nextSession, {
          analysisCursor: nextSession.moveEntries.length,
          cameraPreset: getDefaultCameraPreset(nextSession),
        }),
      });
      await persistLiveAutosave();
      await persistLiveSettings();

      if (nextSession.moveEntries.length > 0) {
        void runAnalysis();
      }
    },

    persistCurrentAutosave: async () => {
      await persistLiveAutosave();
    },
  };
}
