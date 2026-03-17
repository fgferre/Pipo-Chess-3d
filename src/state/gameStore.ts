import { create } from "zustand";
import type { PieceSymbol, Square } from "chess.js";
import { getDifficultyPreset } from "../data/difficulties";
import { buildAnalysisPayload } from "../game/analysis";
import {
  applyEngineMove,
  applyPlayerMove,
  createDefaultSettings,
  createNewSession,
  getLegalMovesForSquare,
  hydrateSession,
  pauseClock,
  resumeClock,
  sessionFromPgn,
  setSessionSettings,
  tickClock,
  undoTurn,
  redoTurn,
  withAnalysis,
  withClockState,
} from "../game/gameService";
import { t } from "../i18n";
import {
  clearAutosave,
  createSaveSlot as persistSaveSlot,
  deleteSaveSlot as removeSaveSlot,
  listSaveSlots,
  loadBootstrapData,
  loadSaveSlot,
  persistAnalysis,
  persistAutosave,
  persistSettings,
} from "../persistence/db";
import type {
  AutosaveRecord,
  CameraPreset,
  EnginePhase,
  GameSession,
  Locale,
  NewGameOptions,
  PendingPromotion,
  SaveSlotRecord,
} from "../types/game";
import { fenToPieces } from "../utils/board";
import { engineClient } from "../engine/EngineClient";

interface HintMove {
  from: Square;
  to: Square;
  pv: string[];
}

interface GameStore {
  booted: boolean;
  enginePhase: EnginePhase;
  engineMessage: string;
  session: GameSession;
  autosave: AutosaveRecord | null;
  saveSlots: SaveSlotRecord[];
  selectedSquare: Square | null;
  legalTargets: Square[];
  hintMove: HintMove | null;
  pendingPromotion: PendingPromotion | null;
  analysisCursor: number | null;
  analysisAutoplay: boolean;
  analysisProgress: { completed: number; total: number; currentPly: number } | null;
  cameraPreset: CameraPreset;
  restoreNotice: string | null;
  lastError: string | null;
  bootstrap: () => Promise<void>;
  selectSquare: (square: Square) => Promise<void>;
  confirmPromotion: (piece: PieceSymbol) => Promise<void>;
  requestHint: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  newGame: (options?: NewGameOptions) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  toggleOrientation: () => Promise<void>;
  setAnimationMode: (mode: GameSession["settings"]["animationMode"]) => Promise<void>;
  setDefaultViewMode: (mode: GameSession["settings"]["defaultViewMode"]) => Promise<void>;
  setCameraSensitivity: (cameraSensitivity: GameSession["settings"]["cameraSensitivity"]) => Promise<void>;
  setCameraPreset: (preset: CameraPreset) => void;
  setAnalysisCursor: (cursor: number | null) => void;
  setAnalysisAutoplay: (enabled: boolean) => void;
  clearRestoreNotice: () => void;
  createManualSave: () => Promise<void>;
  loadManualSave: (id: number) => Promise<void>;
  restoreAutosave: () => Promise<void>;
  deleteManualSave: (id: number) => Promise<void>;
  importPgnText: (pgn: string) => Promise<void>;
  runAnalysis: () => Promise<void>;
  persistCurrentAutosave: () => Promise<void>;
  tickLiveClock: () => void;
}

let subscribedToEngine = false;
let bootstrapPromise: Promise<void> | null = null;
let activeAnalysisSignature: string | null = null;
let cameraSensitivityPersistTimeout: number | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  booted: false,
  enginePhase: "booting",
  engineMessage: "",
  session: createNewSession(),
  autosave: null,
  saveSlots: [],
  selectedSquare: null,
  legalTargets: [],
  hintMove: null,
  pendingPromotion: null,
  analysisCursor: null,
  analysisAutoplay: false,
  analysisProgress: null,
  cameraPreset: "classic",
  restoreNotice: null,
  lastError: null,

  bootstrap: async () => {
    if (get().booted) {
      return;
    }

    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      if (!subscribedToEngine) {
        engineClient.subscribe((event) => {
          if (event.type === "status") {
            const phaseMap: Record<typeof event.phase, EnginePhase> = {
              loading: "booting",
              ready: "ready",
              thinking: "thinking",
              analyzing: "analyzing",
              error: "error",
            };

            set({
              enginePhase: phaseMap[event.phase],
              engineMessage: event.message ?? "",
            });
          }

          if (event.type === "analysisProgress") {
            if (activeAnalysisSignature !== getAnalysisSignature(get().session)) {
              return;
            }

            set({
              analysisProgress: {
                completed: event.completed,
                total: event.total,
                currentPly: event.currentPly,
              },
            });
          }
        });
        subscribedToEngine = true;
      }

      const defaults = createDefaultSettings();
      let liveSession = createNewSession(defaults);
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
            liveSession = resumePersistedSession(hydrateSession(autosave.session, settings));
            restoreNotice = t(liveSession.settings.locale, "toast.autosaveRestored");
          } catch (error) {
            autosave = null;
            liveSession = createNewSession(settings);
            lastError = normalizeErrorMessage(error, t(settings.locale, "save.restoreError"));
            await clearAutosave().catch(() => undefined);
          }
        } else {
          liveSession = createNewSession(settings);
        }
      } catch (error) {
        liveSession = createNewSession(defaults);
        autosave = null;
        saveSlots = [];
        lastError = normalizeErrorMessage(error, t(defaults.locale, "save.restoreError"));
      }

      set({
        booted: true,
        session: liveSession,
        autosave,
        saveSlots,
        selectedSquare: null,
        legalTargets: [],
        hintMove: null,
        pendingPromotion: null,
        analysisCursor: null,
        analysisAutoplay: false,
        analysisProgress: null,
        cameraPreset: getDefaultCameraPreset(liveSession),
        restoreNotice,
        enginePhase: "booting",
        engineMessage: t(liveSession.settings.locale, "engine.prewarm"),
        lastError,
      });

      await persistLiveSettings(get, set);

      try {
        await engineClient.init();
        set({
          enginePhase: "ready",
          engineMessage: t(get().session.settings.locale, "engine.ready"),
        });
      } catch (error) {
        set({
          enginePhase: "error",
          engineMessage: t(get().session.settings.locale, "engine.error"),
          lastError: normalizeErrorMessage(error, t(get().session.settings.locale, "engine.error")),
        });
      }
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  },

  selectSquare: async (square) => {
    const state = get();
    const { session, selectedSquare, legalTargets, analysisCursor, pendingPromotion } = state;

    if (
      analysisCursor !== null ||
      pendingPromotion ||
      session.snapshot.sideToMove !== session.playerColor ||
      (session.snapshot.status !== "active" && session.snapshot.status !== "idle")
    ) {
      return;
    }

    const pieces = fenToPieces(session.snapshot.fen);
    const clickedPiece = pieces.find((piece) => piece.square === square);
    const clickedIsPlayerPiece = clickedPiece?.color === session.playerColor;

    if (!selectedSquare && clickedIsPlayerPiece) {
      set({
        selectedSquare: square,
        legalTargets: getLegalMovesForSquare(session, square),
        hintMove: null,
      });
      return;
    }

    if (selectedSquare && legalTargets.includes(square)) {
      const movingPiece = pieces.find((piece) => piece.square === selectedSquare);
      const isPromotion =
        movingPiece?.type === "p" &&
        ((movingPiece.color === "w" && square.endsWith("8")) ||
          (movingPiece.color === "b" && square.endsWith("1")));

      if (isPromotion) {
        set({
          pendingPromotion: {
            from: selectedSquare,
            to: square,
            anchorSquare: square,
          },
          selectedSquare: null,
          legalTargets: [],
          hintMove: null,
        });
        return;
      }

      await commitPlayerMove(set, get, selectedSquare, square);
      return;
    }

    if (clickedIsPlayerPiece) {
      set({
        selectedSquare: square,
        legalTargets: getLegalMovesForSquare(session, square),
        hintMove: null,
      });
      return;
    }

    set({
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });
  },

  confirmPromotion: async (piece) => {
    if (!["q", "r", "b", "n"].includes(piece)) {
      return;
    }

    const { pendingPromotion } = get();
    if (!pendingPromotion) {
      return;
    }

    await commitPlayerMove(set, get, pendingPromotion.from, pendingPromotion.to, piece);
  },

  requestHint: async () => {
    const { session, analysisCursor, pendingPromotion } = get();

    if (
      analysisCursor !== null ||
      pendingPromotion ||
      session.snapshot.sideToMove !== session.playerColor
    ) {
      return;
    }

    const difficulty = getDifficultyPreset(session.settings.difficultyId);
    const signature = getPositionSignature(session);

    set({ lastError: null });

    try {
      const result = await engineClient.hint(session.snapshot.fen, difficulty);
      const currentSession = get().session;
      if (getPositionSignature(currentSession) !== signature) {
        return;
      }

      set({
        hintMove: {
          from: result.bestMove.slice(0, 2) as Square,
          to: result.bestMove.slice(2, 4) as Square,
          pv: result.pv,
        },
        selectedSquare: result.bestMove.slice(0, 2) as Square,
        legalTargets: getLegalMovesForSquare(currentSession, result.bestMove.slice(0, 2) as Square),
      });
    } catch (error) {
      setStoreError(set, session.settings.locale, error, "engine.error");
    }
  },

  undo: async () => {
    await interruptEngineWork();
    activeAnalysisSignature = null;
    const nextSession = undoTurn(get().session);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      pendingPromotion: null,
      analysisCursor: null,
      analysisAutoplay: false,
      analysisProgress: null,
      restoreNotice: null,
      lastError: null,
    });
    await persistLiveAutosave(get, set);
  },

  redo: async () => {
    await interruptEngineWork();
    activeAnalysisSignature = null;
    const nextSession = redoTurn(get().session);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      pendingPromotion: null,
      analysisCursor: null,
      analysisAutoplay: false,
      analysisProgress: null,
      restoreNotice: null,
      lastError: null,
    });
    await persistLiveAutosave(get, set);

    if (
      nextSession.snapshot.sideToMove !== nextSession.playerColor &&
      nextSession.snapshot.status === "active"
    ) {
      await runEngineMove((partial) => set(partial), get);
    }
  },

  newGame: async (options) => {
    await interruptEngineWork();
    activeAnalysisSignature = null;
    const currentSession = get().session;
    const playerColor = resolveNewGamePlayerColor(options?.playerColor ?? "white");
    const nextSettings: GameSession["settings"] = {
      ...currentSession.settings,
      difficultyId: options?.difficultyId ?? currentSession.settings.difficultyId,
      clockConfig: options?.clockConfig ?? currentSession.settings.clockConfig,
      orientation: playerColor === "b" ? "black" : "white",
    };
    const nextSession = createNewSession(nextSettings, { playerColor });

    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      pendingPromotion: null,
      analysisCursor: null,
      analysisAutoplay: false,
      analysisProgress: null,
      cameraPreset: getDefaultCameraPreset(nextSession),
      restoreNotice: null,
      lastError: null,
    });

    try {
      await engineClient.newGame();
    } catch (error) {
      setStoreError(set, nextSession.settings.locale, error, "engine.error");
    }

    await persistLiveSettings(get, set);

    if (
      nextSession.snapshot.sideToMove !== nextSession.playerColor &&
      (nextSession.snapshot.status === "active" || nextSession.snapshot.status === "idle")
    ) {
      await runEngineMove((partial) => set(partial), get);
      return;
    }

    await persistLiveAutosave(get, set);
  },

  setTheme: async (themeId) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      themeId,
    });
    set({ session: nextSession, lastError: null });
    await persistLiveSettings(get, set);
    await persistLiveAutosave(get, set);
  },

  setLocale: async (locale) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      locale,
    });
    set({ session: nextSession, lastError: null });
    await persistLiveSettings(get, set);
    await persistLiveAutosave(get, set);
  },

  toggleOrientation: async () => {
    const orientation = get().session.settings.orientation === "white" ? "black" : "white";
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      orientation,
    });
    set({ session: nextSession, lastError: null });
    await persistLiveSettings(get, set);
    await persistLiveAutosave(get, set);
  },

  setAnimationMode: async (mode) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      animationMode: mode,
    });
    set({ session: nextSession, lastError: null });
    await persistLiveSettings(get, set);
    await persistLiveAutosave(get, set);
  },

  setDefaultViewMode: async (mode) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      defaultViewMode: mode,
    });
    set({
      session: nextSession,
      cameraPreset: mode === "2d" ? "2d" : "classic",
      lastError: null,
    });
    await persistLiveSettings(get, set);
    await persistLiveAutosave(get, set);
  },

  setCameraSensitivity: async (cameraSensitivity) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      cameraSensitivity,
    });
    set({ session: nextSession, lastError: null });
    scheduleCameraSensitivityPersistence(get, set);
  },

  setCameraPreset: (preset) => {
    set({ cameraPreset: preset });
  },

  setAnalysisCursor: (cursor) => {
    if (cursor === null) {
      set({
        analysisCursor: null,
        analysisAutoplay: false,
        selectedSquare: null,
        legalTargets: [],
        hintMove: null,
      });
      return;
    }

    const total = get().session.moveEntries.length;
    const clampedCursor = Math.min(Math.max(0, cursor), total);
    set({
      analysisCursor: clampedCursor,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });
  },

  setAnalysisAutoplay: (enabled) => {
    if (!enabled) {
      set({ analysisAutoplay: false });
      return;
    }

    const total = get().session.moveEntries.length;
    if (total === 0) {
      set({ analysisAutoplay: false });
      return;
    }

    const currentCursor = get().analysisCursor ?? total;
    set({
      analysisCursor: currentCursor >= total ? 0 : currentCursor,
      analysisAutoplay: true,
    });
  },

  clearRestoreNotice: () => {
    set({ restoreNotice: null });
  },

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

    await persistLiveAutosave(get, set);
  },

  loadManualSave: async (id) => {
    await interruptEngineWork();

    try {
      const record = await loadSaveSlot(id);
      if (!record) {
        return;
      }

      activeAnalysisSignature = null;
      const nextSession = resumePersistedSession(hydrateSession(record.session, get().session.settings));
      set({
        session: nextSession,
        selectedSquare: null,
        legalTargets: [],
        hintMove: null,
        pendingPromotion: null,
        analysisCursor: null,
        analysisAutoplay: false,
        analysisProgress: null,
        cameraPreset: getDefaultCameraPreset(nextSession),
        restoreNotice: null,
        lastError: null,
      });
      await persistLiveAutosave(get, set);
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
      activeAnalysisSignature = null;
      const nextSession = resumePersistedSession(hydrateSession(autosave.session, get().session.settings));
      set({
        session: nextSession,
        selectedSquare: null,
        legalTargets: [],
        hintMove: null,
        pendingPromotion: null,
        analysisCursor: null,
        analysisAutoplay: false,
        analysisProgress: null,
        cameraPreset: getDefaultCameraPreset(nextSession),
        restoreNotice: t(nextSession.settings.locale, "toast.autosaveRestored"),
        lastError: null,
      });
      await persistLiveAutosave(get, set);
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
    activeAnalysisSignature = null;
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      pendingPromotion: null,
      analysisCursor: nextSession.moveEntries.length,
      analysisAutoplay: false,
      analysisProgress: null,
      cameraPreset: getDefaultCameraPreset(nextSession),
      restoreNotice: null,
      lastError: null,
    });
    await persistLiveAutosave(get, set);
    await persistLiveSettings(get, set);

    if (nextSession.moveEntries.length > 0) {
      void get().runAnalysis();
    }
  },

  runAnalysis: async () => {
    const session = get().session;
    if (session.moveEntries.length === 0 || get().analysisProgress) {
      return;
    }

    const signature = getAnalysisSignature(session);
    activeAnalysisSignature = signature;
    set({
      analysisProgress: {
        completed: 0,
        total: session.moveEntries.length,
        currentPly: 0,
      },
      lastError: null,
    });

    try {
      const summary = await engineClient.analyzeGame(buildAnalysisPayload(session));
      if (activeAnalysisSignature !== signature || getAnalysisSignature(get().session) !== signature) {
        return;
      }

      const nextSession = withAnalysis(get().session, summary);

      set({
        session: nextSession,
        analysisProgress: null,
      });

      try {
        await persistAnalysis({
          createdAt: new Date().toISOString(),
          pgn: nextSession.snapshot.pgn,
          summary,
        });
      } catch (error) {
        setStoreError(set, nextSession.settings.locale, error, "save.persistError");
      }

      await persistLiveAutosave(get, set);
    } catch (error) {
      if (error instanceof Error && error.message === "Analysis interrupted") {
        return;
      }

      set({
        analysisProgress: null,
      });
      setStoreError(set, get().session.settings.locale, error, "engine.error");
    } finally {
      if (activeAnalysisSignature === signature) {
        activeAnalysisSignature = null;
      }
    }
  },

  persistCurrentAutosave: async () => {
    await persistLiveAutosave(get, set);
  },

  tickLiveClock: () => {
    const state = get();
    if (
      !state.booted ||
      state.analysisCursor !== null ||
      !state.session.settings.clockConfig.enabled
    ) {
      return;
    }

    const nextClockState = tickClock(state.session.snapshot.clockState);
    if (nextClockState === state.session.snapshot.clockState) {
      return;
    }

    set({
      session: withClockState(state.session, nextClockState),
    });
  },
}));

async function commitPlayerMove(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): Promise<void> {
  const session = get().session;
  const nextSession = applyPlayerMove(session, from, to, promotion);

  if (!nextSession) {
    return;
  }

  await interruptEngineWork();
  activeAnalysisSignature = null;
  set({
    session: nextSession,
    selectedSquare: null,
    legalTargets: [],
    hintMove: null,
    pendingPromotion: null,
    analysisCursor: null,
    analysisAutoplay: false,
    analysisProgress: null,
    restoreNotice: null,
    lastError: null,
  });

  if (
    nextSession.snapshot.sideToMove !== nextSession.playerColor &&
    nextSession.snapshot.status === "active"
  ) {
    await runEngineMove(set, get);
    return;
  }

  await persistLiveAutosave(get, set);
}

async function runEngineMove(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
): Promise<void> {
  const state = get();
  if (
    state.session.snapshot.sideToMove === state.session.playerColor ||
    state.session.snapshot.status !== "active"
  ) {
    return;
  }

  const difficulty = getDifficultyPreset(state.session.settings.difficultyId);
  const signature = getPositionSignature(state.session);

  try {
    const result = await engineClient.search(state.session.snapshot.fen, difficulty);
    const currentSession = get().session;
    if (
      getPositionSignature(currentSession) !== signature ||
      currentSession.snapshot.sideToMove === currentSession.playerColor ||
      currentSession.snapshot.status !== "active" ||
      currentSession.snapshot.clockState.expiredColor
    ) {
      return;
    }

    const nextSession = applyEngineMove(currentSession, result.bestMove);
    if (nextSession === currentSession) {
      return;
    }

    set({
      session: nextSession,
      hintMove: null,
      selectedSquare: null,
      legalTargets: [],
      pendingPromotion: null,
      lastError: null,
    });

    await persistLiveAutosave(get, set);
  } catch (error) {
    setStoreError(set, state.session.settings.locale, error, "engine.error");
  }
}

async function persistLiveAutosave(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
): Promise<void> {
  try {
    const autosave = await persistAutosave(createPersistedSessionSnapshot(get().session));
    set({ autosave });
  } catch (error) {
    setStoreError(set, get().session.settings.locale, error, "save.persistError");
  }
}

async function persistLiveSettings(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
): Promise<void> {
  try {
    await persistSettings(get().session.settings);
  } catch (error) {
    setStoreError(set, get().session.settings.locale, error, "save.persistError");
  }
}

function scheduleCameraSensitivityPersistence(
  get: () => GameStore,
  set: (partial: Partial<GameStore>) => void,
): void {
  if (cameraSensitivityPersistTimeout !== null) {
    window.clearTimeout(cameraSensitivityPersistTimeout);
  }

  cameraSensitivityPersistTimeout = window.setTimeout(() => {
    cameraSensitivityPersistTimeout = null;
    void persistLiveSettings(get, set);
    void persistLiveAutosave(get, set);
  }, 180);
}

async function interruptEngineWork(): Promise<void> {
  try {
    await engineClient.stop();
  } catch {
    // Ignore stop failures and let the caller continue with local state updates.
  }
}

function createPersistedSessionSnapshot(session: GameSession): GameSession {
  return withClockState(session, pauseClock(session.snapshot.clockState));
}

function resumePersistedSession(session: GameSession): GameSession {
  const clockState = {
    ...session.snapshot.clockState,
    running: false,
    lastTickAt: null,
  };

  return withClockState(session, resumeClock(clockState));
}

function getPositionSignature(session: GameSession): string {
  return `${session.snapshot.fen}|${session.moveEntries.length}|${session.settings.difficultyId}|${session.snapshot.status}`;
}

function getAnalysisSignature(session: GameSession): string {
  return session.snapshot.pgn;
}

function getDefaultCameraPreset(session: GameSession): CameraPreset {
  return session.settings.defaultViewMode === "2d" ? "2d" : "classic";
}

function resolveNewGamePlayerColor(choice: NewGameOptions["playerColor"]): "w" | "b" {
  if (choice === "black") {
    return "b";
  }

  if (choice === "random") {
    return Math.random() < 0.5 ? "w" : "b";
  }

  return "w";
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function setStoreError(
  set: (partial: Partial<GameStore>) => void,
  locale: Locale,
  error: unknown,
  fallbackKey: Parameters<typeof t>[1],
): void {
  set({
    lastError: normalizeErrorMessage(error, t(locale, fallbackKey)),
  });
}
