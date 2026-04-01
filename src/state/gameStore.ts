import { create } from "zustand";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import { getDifficultyPreset } from "../data/difficulties";
import { buildAnalysisPayload } from "../game/analysis";
import {
  applyEngineMove,
  applyPlayerMove,
  getCastlingTargetsForSquare,
  getLegalMovesForSquare,
  resolveSquareInteraction,
  redoTurn,
  tickClock,
  undoTurn,
  withAnalysis,
  withClockState,
} from "../game/gameService";
import { t } from "../i18n";
import { persistAnalysis } from "../persistence/db";
import { engineClient } from "../engine/EngineClient";
import type { InteractionOutcome } from "../types/game";
import {
  clearTrackedAnalysis,
  ensureEngineSubscription,
  interruptEngineWork,
  isTrackedAnalysisSession,
  startTrackedAnalysis,
} from "./gameStoreRuntime";
import {
  createPersistenceActions,
  loadGameStoreBootstrapState,
  persistAutosaveSnapshot,
  persistSessionSettings,
  scheduleDeferredPersistence,
} from "./gameStorePersistence";
import {
  buildSelectionResetPatch,
  buildSessionPatch,
  buildSessionResetPatch,
  createQualitySession,
  createSettingsActions,
  getDefaultCameraPreset,
  getPositionSignature,
  normalizeErrorMessage,
  resolveNewGamePlayerColor,
  setStoreError,
} from "./gameStoreSession";
import type { GameStore, GameStoreGet, GameStoreSet } from "./gameStoreTypes";

let bootstrapPromise: Promise<void> | null = null;
const initialSession = createQualitySession({});

export const useGameStore = create<GameStore>((set, get) => ({
  booted: false,
  enginePhase: "booting",
  engineMessage: "",
  ...buildSessionPatch(initialSession),
  autosave: null,
  saveSlots: [],
  selectedSquare: null,
  legalTargets: [],
  castlingTargets: [],
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
      ensureEngineSubscription(set, get);
      const { liveSession, autosave, saveSlots, restoreNotice, lastError } = await loadGameStoreBootstrapState();

      set({
        booted: true,
        ...buildSessionResetPatch(liveSession, {
          autosave,
          saveSlots,
          cameraPreset: getDefaultCameraPreset(liveSession),
          restoreNotice,
          lastError,
        }),
        enginePhase: "booting",
        engineMessage: t(liveSession.settings.locale, "engine.prewarm"),
      });

      await persistLiveSettings(get, set);

      // Defer engine init — the 7 MB WASM download runs in the background so the
      // 3D scene can finish loading without waiting for Stockfish.  The first
      // actual engine call (hint / move) is always user-initiated.
      void (async () => {
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
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  },

  selectSquare: async (square) => {
    const state = get();
    const { session, selectedSquare, analysisCursor, pendingPromotion } = state;
    const selection = {
      selectedSquare,
      legalTargets: state.legalTargets,
      castlingTargets: state.castlingTargets,
    };
    const clickedPiece = new Chess(session.snapshot.fen).get(square);

    if (
      analysisCursor !== null
    ) {
      const outcome: InteractionOutcome = {
        kind: "blocked",
        reason: "analysis-active",
        square,
        selection,
      };
      return outcome;
    }

    if (pendingPromotion) {
      const outcome: InteractionOutcome = {
        kind: "blocked",
        reason: "promotion-pending",
        square,
        selection,
      };
      return outcome;
    }

    if (session.snapshot.status !== "active" && session.snapshot.status !== "idle") {
      if (!clickedPiece && !selectedSquare) {
        return {
          kind: "ignored",
          selection,
        };
      }

      const outcome: InteractionOutcome = {
        kind: "blocked",
        reason: "inactive-session",
        square,
        selection,
      };
      return outcome;
    }

    if (session.snapshot.sideToMove !== session.playerColor) {
      if (!clickedPiece && !selectedSquare) {
        return {
          kind: "ignored",
          selection,
        };
      }

      const outcome: InteractionOutcome = {
        kind: "blocked",
        reason: "out-of-turn",
        square,
        selection,
      };
      return outcome;
    }

    if (!selectedSquare && clickedPiece && clickedPiece.color !== session.playerColor) {
      const outcome: InteractionOutcome = {
        kind: "blocked",
        reason: "opponent-piece",
        square,
        selection,
      };
      return outcome;
    }

    const outcome = resolveSquareInteraction(session, selectedSquare, square);

    if (outcome.kind === "select") {
      set({
        selectedSquare: outcome.selection.selectedSquare,
        legalTargets: outcome.selection.legalTargets,
        castlingTargets: outcome.selection.castlingTargets,
        hintMove: null,
      });
      return outcome;
    }

    if (outcome.kind === "promotion") {
      set({
        pendingPromotion: outcome.pendingPromotion,
        selectedSquare: null,
        legalTargets: [],
        castlingTargets: [],
        hintMove: null,
      });
      return outcome;
    }

    if (outcome.kind === "move") {
      await commitPlayerMove(set, get, outcome.from, outcome.to);
      return outcome;
    }

    if (outcome.kind === "illegal") {
      set({
        selectedSquare: outcome.selection.selectedSquare,
        legalTargets: outcome.selection.legalTargets,
        castlingTargets: outcome.selection.castlingTargets,
        hintMove: null,
      });
      return outcome;
    }

    if (outcome.kind === "clear") {
      set({
        selectedSquare: null,
        legalTargets: [],
        castlingTargets: [],
        hintMove: null,
      });
      return outcome;
    }

    return outcome;
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
        castlingTargets: getCastlingTargetsForSquare(currentSession, result.bestMove.slice(0, 2) as Square),
      });
    } catch (error) {
      setStoreError(set, session.settings.locale, error, "engine.error");
    }
  },

  undo: async () => {
    await interruptEngineWork();
    clearTrackedAnalysis();
    const currentSession = get().session;
    const appliedSession = undoTurn(currentSession);
    if (appliedSession === currentSession) {
      return;
    }
    const nextSession = appliedSession;
    set({ ...buildSessionResetPatch(nextSession) });
    await persistLiveAutosave(get, set);
  },

  redo: async () => {
    await interruptEngineWork();
    clearTrackedAnalysis();
    const currentSession = get().session;
    const appliedSession = redoTurn(currentSession);
    if (appliedSession === currentSession) {
      return;
    }
    const nextSession = appliedSession;
    set({ ...buildSessionResetPatch(nextSession) });
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
    clearTrackedAnalysis();
    const currentSession = get().session;
    const playerColor = resolveNewGamePlayerColor(options?.playerColor ?? "white");
    const nextSettings = {
      ...currentSession.settings,
      difficultyId: options?.difficultyId ?? currentSession.settings.difficultyId,
      clockConfig: options?.clockConfig ?? currentSession.settings.clockConfig,
      orientation: playerColor === "b" ? "black" : "white",
    } satisfies Partial<GameStore["session"]["settings"]>;
    const nextSession = createQualitySession(nextSettings, { playerColor });

    set({
      ...buildSessionResetPatch(nextSession, {
        cameraPreset: getDefaultCameraPreset(nextSession),
      }),
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

  ...createSettingsActions({
    get,
    set,
    persistLiveSettings: () => persistLiveSettings(get, set),
    persistLiveAutosave: () => persistLiveAutosave(get, set),
    scheduleCameraSensitivityPersistence: () => scheduleCameraSensitivityPersistence(get, set),
  }),

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
        castlingTargets: [],
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
      castlingTargets: [],
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

  ...createPersistenceActions({
    get,
    set,
    interruptEngineWork,
    clearTrackedAnalysis: () => clearTrackedAnalysis(),
    runAnalysis: () => get().runAnalysis(),
    persistLiveAutosave: () => persistLiveAutosave(get, set),
    persistLiveSettings: () => persistLiveSettings(get, set),
  }),

  runAnalysis: async () => {
    const session = get().session;
    if (session.moveEntries.length === 0 || get().analysisProgress) {
      return;
    }

    const signature = startTrackedAnalysis(session);
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
      if (!isTrackedAnalysisSession(get().session)) {
        return;
      }

      const currentSession = get().session;
      const nextSession = withAnalysis(currentSession, summary);

      set({
        ...buildSessionPatch(nextSession),
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
      clearTrackedAnalysis(signature);
    }
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
      ...buildSessionPatch(withClockState(state.session, nextClockState)),
    });
  },
}));

async function commitPlayerMove(
  set: GameStoreSet,
  get: GameStoreGet,
  from: Square,
  to: Square,
  promotion?: PieceSymbol,
): Promise<void> {
  const session = get().session;
  const appliedSession = applyPlayerMove(session, from, to, promotion);

  if (!appliedSession) {
    return;
  }
  const nextSession = appliedSession;

  await interruptEngineWork();
  clearTrackedAnalysis();
  set({ ...buildSessionResetPatch(nextSession) });

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
  set: GameStoreSet,
  get: GameStoreGet,
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

    const appliedSession = applyEngineMove(currentSession, result.bestMove);
    if (appliedSession === currentSession) {
      return;
    }
    const nextSession = appliedSession;

    set({
      ...buildSessionPatch(nextSession),
      ...buildSelectionResetPatch(),
      pendingPromotion: null,
      lastError: null,
    });

    await persistLiveAutosave(get, set);
  } catch (error) {
    setStoreError(set, state.session.settings.locale, error, "engine.error");
  }
}

async function persistLiveAutosave(
  get: GameStoreGet,
  set: GameStoreSet,
): Promise<void> {
  try {
    const autosave = await persistAutosaveSnapshot(get().session);
    set({ autosave });
  } catch (error) {
    setStoreError(set, get().session.settings.locale, error, "save.persistError");
  }
}

async function persistLiveSettings(
  get: GameStoreGet,
  set: GameStoreSet,
): Promise<void> {
  try {
    await persistSessionSettings(get().session.settings);
  } catch (error) {
    setStoreError(set, get().session.settings.locale, error, "save.persistError");
  }
}

function scheduleCameraSensitivityPersistence(
  get: GameStoreGet,
  set: GameStoreSet,
): void {
  scheduleDeferredPersistence(() => {
    void persistLiveSettings(get, set);
    void persistLiveAutosave(get, set);
  });
}
