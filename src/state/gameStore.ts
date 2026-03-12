import { create } from "zustand";
import type { Square } from "chess.js";
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
  ClockConfig,
  EnginePhase,
  GameSession,
  Locale,
  SaveSlotRecord,
} from "../types/game";
import { fenToPieces } from "../utils/board";
import { downloadTextFile } from "../utils/files";
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
  saveSlots: SaveSlotRecord[];
  selectedSquare: Square | null;
  legalTargets: Square[];
  hintMove: HintMove | null;
  analysisProgress: { completed: number; total: number; currentPly: number } | null;
  lastError: string | null;
  bootstrap: () => Promise<void>;
  selectSquare: (square: Square) => Promise<void>;
  requestHint: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  newGame: () => Promise<void>;
  setDifficulty: (difficultyId: string) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  toggleOrientation: () => Promise<void>;
  setClockConfig: (clockConfig: ClockConfig) => Promise<void>;
  createManualSave: () => Promise<void>;
  loadManualSave: (id: number) => Promise<void>;
  deleteManualSave: (id: number) => Promise<void>;
  exportPgn: () => void;
  importPgnText: (pgn: string) => Promise<void>;
  runAnalysis: () => Promise<void>;
  persistCurrentAutosave: () => Promise<void>;
  tickLiveClock: () => void;
}

let subscribedToEngine = false;

export const useGameStore = create<GameStore>((set, get) => ({
  booted: false,
  enginePhase: "booting",
  engineMessage: "",
  session: createNewSession(),
  saveSlots: [],
  selectedSquare: null,
  legalTargets: [],
  hintMove: null,
  analysisProgress: null,
  lastError: null,

  bootstrap: async () => {
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
    const bootstrapData = await loadBootstrapData();
    const settings = bootstrapData.settings ?? defaults;
    const restoredSession = bootstrapData.autosave
      ? hydrateSession(bootstrapData.autosave, settings)
      : createNewSession(settings);
    const liveSession = withClockState(
      restoredSession,
      resumeClock(pauseClock(restoredSession.snapshot.clockState)),
    );

    set({
      booted: true,
      session: liveSession,
      saveSlots: bootstrapData.saves,
      enginePhase: "booting",
      engineMessage: t(liveSession.settings.locale, "engine.prewarm"),
    });

    await persistSettings(liveSession.settings);

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
        lastError: error instanceof Error ? error.message : "Engine failed",
      });
    }
  },

  selectSquare: async (square) => {
    const state = get();
    const { session, selectedSquare, legalTargets } = state;

    if (session.snapshot.sideToMove !== session.playerColor || session.snapshot.status !== "active" && session.snapshot.status !== "idle") {
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
      const nextSession = applyPlayerMove(
        session,
        selectedSquare,
        square,
        isPromotion ? "q" : undefined,
      );

      if (!nextSession) {
        return;
      }

      set({
        session: nextSession,
        selectedSquare: null,
        legalTargets: [],
        hintMove: null,
      });

      if (nextSession.snapshot.sideToMove === "b" && nextSession.snapshot.status === "active") {
        await runEngineMove((partial) => set(partial), get);
      } else {
        await persistLiveAutosave(get);
      }

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

  requestHint: async () => {
    const { session } = get();

    if (session.snapshot.sideToMove !== session.playerColor) {
      return;
    }

    const difficulty = getDifficultyPreset(session.settings.difficultyId);
    const result = await engineClient.hint(session.snapshot.fen, difficulty);

    set({
      hintMove: {
        from: result.bestMove.slice(0, 2) as Square,
        to: result.bestMove.slice(2, 4) as Square,
        pv: result.pv,
      },
      selectedSquare: result.bestMove.slice(0, 2) as Square,
      legalTargets: getLegalMovesForSquare(session, result.bestMove.slice(0, 2) as Square),
    });
  },

  undo: async () => {
    const nextSession = undoTurn(get().session);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });
    await persistLiveAutosave(get);
  },

  redo: async () => {
    const nextSession = redoTurn(get().session);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });
    await persistLiveAutosave(get);

    if (nextSession.snapshot.sideToMove === "b" && nextSession.snapshot.status === "active") {
      await runEngineMove((partial) => set(partial), get);
    }
  },

  newGame: async () => {
    const nextSession = createNewSession(get().session.settings);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      analysisProgress: null,
    });
    await engineClient.newGame();
    await persistLiveAutosave(get);
  },

  setDifficulty: async (difficultyId) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      difficultyId,
    });
    set({ session: nextSession });
    await persistSettings(get().session.settings);
    await persistLiveAutosave(get);
  },

  setTheme: async (themeId) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      themeId,
    });
    set({ session: nextSession });
    await persistSettings(get().session.settings);
    await persistLiveAutosave(get);
  },

  setLocale: async (locale) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      locale,
    });
    set({ session: nextSession });
    await persistSettings(get().session.settings);
    await persistLiveAutosave(get);
  },

  toggleOrientation: async () => {
    const orientation = get().session.settings.orientation === "white" ? "black" : "white";
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      orientation,
    });
    set({ session: nextSession });
    await persistSettings(get().session.settings);
    await persistLiveAutosave(get);
  },

  setClockConfig: async (clockConfig) => {
    const nextSession = setSessionSettings(get().session, {
      ...get().session.settings,
      clockConfig,
    });
    set({ session: nextSession });
    await persistSettings(get().session.settings);
    await persistLiveAutosave(get);
  },

  createManualSave: async () => {
    const state = get();
    const label = `${t(state.session.settings.locale, "save.labelPrefix")} ${String(
      state.saveSlots.length + 1,
    ).padStart(2, "0")}`;
    await persistSaveSlot(state.session, label);
    const saves = await listSaveSlots();
    set({ saveSlots: saves });
    await persistLiveAutosave(get);
  },

  loadManualSave: async (id) => {
    const record = await loadSaveSlot(id);
    if (!record) {
      return;
    }

    const nextSession = hydrateSession(record.session, get().session.settings);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      analysisProgress: null,
    });
    await persistLiveAutosave(get);
  },

  deleteManualSave: async (id) => {
    await removeSaveSlot(id);
    const saves = await listSaveSlots();
    set({ saveSlots: saves });
  },

  exportPgn: () => {
    const state = get();
    const filename = `pipo-chess-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.pgn`;
    downloadTextFile(filename, state.session.snapshot.pgn);
  },

  importPgnText: async (pgn) => {
    const nextSession = sessionFromPgn(pgn, get().session.settings);
    set({
      session: nextSession,
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
      analysisProgress: null,
    });
    await persistLiveAutosave(get);
    await persistSettings(get().session.settings);
  },

  runAnalysis: async () => {
    const session = get().session;
    const summary = await engineClient.analyzeGame(buildAnalysisPayload(session));
    const nextSession = withAnalysis(session, summary);

    set({
      session: nextSession,
      analysisProgress: null,
    });

    await persistAnalysis({
      createdAt: new Date().toISOString(),
      pgn: nextSession.snapshot.pgn,
      summary,
    });
    await persistLiveAutosave(get);
  },

  persistCurrentAutosave: async () => {
    const nextSession = withClockState(get().session, pauseClock(get().session.snapshot.clockState));
    set({ session: nextSession });
    await persistAutosave(nextSession);
  },

  tickLiveClock: () => {
    const state = get();
    if (!state.booted || !state.session.settings.clockConfig.enabled) {
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

async function runEngineMove(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
): Promise<void> {
  const state = get();
  const difficulty = getDifficultyPreset(state.session.settings.difficultyId);
  const result = await engineClient.search(state.session.snapshot.fen, difficulty);
  const nextSession = applyEngineMove(get().session, result.bestMove);

  set({
    session: nextSession,
    hintMove: null,
    selectedSquare: null,
    legalTargets: [],
  });

  await persistLiveAutosave(get);
}

async function persistLiveAutosave(get: () => GameStore): Promise<void> {
  await persistAutosave(get().session);
}
