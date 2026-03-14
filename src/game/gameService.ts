import { Chess, type Color, type Move, type Square } from "chess.js";
import { defaultClockConfig, normalizeClockConfig } from "../data/clocks";
import { defaultDifficultyId } from "../data/difficulties";
import { defaultThemeId } from "../data/themes";
import type {
  AppSettings,
  ClockConfig,
  ClockState,
  GameSession,
  GameSnapshot,
  Orientation,
  SerializableMove,
} from "../types/game";
import { buildPgn, extractSettingsFromHeaders } from "./pgn";

const DEFAULT_PLAYER_COLOR: Color = "w";
const START_FEN = new Chess().fen();

export function createDefaultSettings(): AppSettings {
  return {
    difficultyId: defaultDifficultyId,
    themeId: defaultThemeId,
    locale: "pt-BR",
    orientation: "white",
    clockConfig: defaultClockConfig,
    animationMode: "normal",
    defaultViewMode: "3d",
  };
}

export function createNewSession(
  settings: AppSettings = createDefaultSettings(),
  options: { playerColor?: Color } = {},
): GameSession {
  const normalized = normalizeSettings(settings);
  const chess = new Chess();

  return buildSessionFromChess(
    chess,
    normalized,
    [],
    options.playerColor ?? DEFAULT_PLAYER_COLOR,
    createInitialClockState(normalized.clockConfig),
  );
}

export function hydrateSession(session: GameSession, fallbackSettings: AppSettings): GameSession {
  const normalized = normalizeSettings({
    ...fallbackSettings,
    ...session.settings,
    clockConfig: normalizeClockConfig(session.settings.clockConfig),
  });
  const chess = replayMoveEntries(session.moveEntries);

  return buildSessionFromChess(
    chess,
    normalized,
    session.redoStack,
    session.playerColor ?? DEFAULT_PLAYER_COLOR,
    session.snapshot.clockState,
    session.analysisSummary,
  );
}

export function sessionFromPgn(pgn: string, fallbackSettings: AppSettings): GameSession {
  const chess = new Chess();
  chess.loadPgn(pgn, { newlineChar: "\n" });
  const restored = extractSettingsFromHeaders(chess.getHeaders(), normalizeSettings(fallbackSettings));

  return buildSessionFromChess(
    chess,
    restored.settings,
    [],
    restored.playerColor,
    createInitialClockState(restored.settings.clockConfig, chess.turn()),
  );
}

export function setSessionSettings(session: GameSession, settings: AppSettings): GameSession {
  const chess = replayMoveEntries(session.moveEntries);

  return buildSessionFromChess(
    chess,
    normalizeSettings(settings),
    session.redoStack,
    session.playerColor,
    session.snapshot.clockState,
    session.analysisSummary,
  );
}

export function getLegalMovesForSquare(session: GameSession, square: Square): Square[] {
  const chess = replayMoveEntries(session.moveEntries);

  return chess.moves({ square, verbose: true }).map((move) => move.to);
}

export function applyPlayerMove(
  session: GameSession,
  from: Square,
  to: Square,
  promotion?: string,
  timestamp = Date.now(),
): GameSession | null {
  const chess = replayMoveEntries(session.moveEntries);
  const clockState = tickClock(session.snapshot.clockState, timestamp);

  if (clockState.expiredColor) {
    return markTimeout(session, clockState);
  }

  const result = chess.move({ from, to, promotion });

  if (!result) {
    return null;
  }

  const nextClockState = commitMoveOnClock(clockState, result.color, session.settings.clockConfig, timestamp);

  return buildSessionFromChess(
    chess,
    session.settings,
    [],
    session.playerColor,
    finalizeClockForPosition(chess, nextClockState),
    session.analysisSummary,
  );
}

export function applyEngineMove(
  session: GameSession,
  bestMove: string,
  timestamp = Date.now(),
): GameSession {
  const chess = replayMoveEntries(session.moveEntries);
  const clockState = tickClock(session.snapshot.clockState, timestamp);
  const normalized = normalizeUci(bestMove);
  const mover = session.snapshot.sideToMove;

  chess.move({
    from: normalized.from,
    to: normalized.to,
    promotion: normalized.promotion,
  });

  const nextClockState = commitMoveOnClock(clockState, mover, session.settings.clockConfig, timestamp);
  return buildSessionFromChess(
    chess,
    session.settings,
    [],
    session.playerColor,
    finalizeClockForPosition(chess, nextClockState),
    session.analysisSummary,
  );
}

export function undoTurn(session: GameSession): GameSession {
  if (session.moveEntries.length === 0) {
    return session;
  }

  const removeCount = session.snapshot.sideToMove === session.playerColor ? 2 : 1;
  const removed = session.moveEntries.slice(-removeCount);
  const remaining = session.moveEntries.slice(0, Math.max(0, session.moveEntries.length - removeCount));
  const chess = replayMoveEntries(remaining);

  return buildSessionFromChess(
    chess,
    session.settings,
    [removed, ...session.redoStack],
    session.playerColor,
    createInitialClockState(session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
  );
}

export function redoTurn(session: GameSession): GameSession {
  if (session.redoStack.length === 0) {
    return session;
  }

  const [chunk, ...rest] = session.redoStack;
  const combined = [...session.moveEntries, ...chunk];
  const chess = replayMoveEntries(combined);

  return buildSessionFromChess(
    chess,
    session.settings,
    rest,
    session.playerColor,
    createInitialClockState(session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
  );
}

export function withAnalysis(session: GameSession, analysisSummary: GameSession["analysisSummary"]): GameSession {
  return {
    ...session,
    analysisSummary,
  };
}

export function withClockState(session: GameSession, clockState: ClockState): GameSession {
  const chess = replayMoveEntries(session.moveEntries);

  return buildSessionFromChess(
    chess,
    session.settings,
    session.redoStack,
    session.playerColor,
    finalizeClockForPosition(chess, clockState),
    session.analysisSummary,
  );
}

export function deriveSessionAtPly(session: GameSession, ply: number): GameSession {
  const clampedPly = Math.min(Math.max(0, ply), session.moveEntries.length);
  const moveEntries = session.moveEntries.slice(0, clampedPly);
  const chess = replayMoveEntries(moveEntries);

  return buildSessionFromChess(
    chess,
    session.settings,
    [],
    session.playerColor,
    createInitialClockState(session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
  );
}

export function tickClock(clockState: ClockState, timestamp = Date.now()): ClockState {
  if (!clockState.running || !clockState.activeColor || clockState.lastTickAt === null) {
    return clockState;
  }

  const elapsed = Math.max(0, timestamp - clockState.lastTickAt);
  const key = clockState.activeColor === "w" ? "whiteMs" : "blackMs";
  const next = {
    ...clockState,
    [key]: Math.max(0, clockState[key] - elapsed),
    lastTickAt: timestamp,
  };

  if (next[key] <= 0) {
    return {
      ...next,
      expiredColor: clockState.activeColor,
      running: false,
      activeColor: null,
    };
  }

  return next;
}

export function pauseClock(clockState: ClockState, timestamp = Date.now()): ClockState {
  const next = tickClock(clockState, timestamp);
  return {
    ...next,
    running: false,
    lastTickAt: null,
  };
}

export function resumeClock(clockState: ClockState, timestamp = Date.now()): ClockState {
  if (clockState.expiredColor || !clockState.activeColor) {
    return clockState;
  }

  return {
    ...clockState,
    running: true,
    lastTickAt: timestamp,
  };
}

function buildSessionFromChess(
  chess: Chess,
  settings: AppSettings,
  redoStack: SerializableMove[][],
  playerColor: Color,
  clockState: ClockState,
  analysisSummary?: GameSession["analysisSummary"],
): GameSession {
  const moveEntries = serializeHistory(chess);
  const snapshot = buildSnapshot(chess, settings, moveEntries, redoStack, playerColor, clockState);

  return {
    snapshot,
    moveEntries,
    redoStack,
    settings,
    playerColor,
    analysisSummary,
  };
}

function buildSnapshot(
  chess: Chess,
  settings: AppSettings,
  moveEntries: SerializableMove[],
  redoStack: SerializableMove[][],
  playerColor: Color,
  clockState: ClockState,
): GameSnapshot {
  return {
    fen: chess.fen(),
    pgn: buildPgn(chess, settings, playerColor),
    moveList: moveEntries,
    sideToMove: chess.turn(),
    status: deriveStatus(chess, clockState),
    orientation: settings.orientation,
    clockState,
    difficultyId: settings.difficultyId,
    themeId: settings.themeId,
    locale: settings.locale,
    canUndo: moveEntries.length > 0,
    canRedo: redoStack.length > 0,
  };
}

function serializeHistory(chess: Chess): SerializableMove[] {
  const history = chess.history({ verbose: true });
  const replay = new Chess();

  return history.map((move, index) => {
    const beforeFen = replay.fen();
    replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });

    return {
      ply: index + 1,
      color: move.color,
      piece: move.piece,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      from: move.from,
      to: move.to,
      beforeFen,
      afterFen: replay.fen(),
      captured: move.captured,
      promotion: move.promotion,
    };
  });
}

function replayMoveEntries(moveEntries: SerializableMove[]): Chess {
  const chess = new Chess(moveEntries[0]?.beforeFen ?? START_FEN);

  for (const move of moveEntries) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  }

  return chess;
}

function createInitialClockState(clockConfig: ClockConfig, activeColor: Color = "w"): ClockState {
  if (!clockConfig.enabled) {
    return {
      whiteMs: 0,
      blackMs: 0,
      activeColor: null,
      lastTickAt: null,
      running: false,
      expiredColor: null,
    };
  }

  return {
    whiteMs: clockConfig.baseMs,
    blackMs: clockConfig.baseMs,
    activeColor,
    lastTickAt: Date.now(),
    running: true,
    expiredColor: null,
  };
}

function commitMoveOnClock(
  clockState: ClockState,
  mover: Color,
  clockConfig: ClockConfig,
  timestamp: number,
): ClockState {
  if (!clockConfig.enabled || clockState.expiredColor) {
    return clockState;
  }

  const nextActive = mover === "w" ? "b" : "w";

  if (mover === "w") {
    return {
      ...clockState,
      whiteMs: clockState.whiteMs + clockConfig.incrementMs,
      activeColor: nextActive,
      lastTickAt: timestamp,
      running: true,
    };
  }

  return {
    ...clockState,
    blackMs: clockState.blackMs + clockConfig.incrementMs,
    activeColor: nextActive,
    lastTickAt: timestamp,
    running: true,
  };
}

function finalizeClockForPosition(chess: Chess, clockState: ClockState): ClockState {
  if (chess.isGameOver() || clockState.expiredColor) {
    return {
      ...clockState,
      activeColor: null,
      running: false,
      lastTickAt: null,
    };
  }

  return clockState;
}

function deriveStatus(chess: Chess, clockState: ClockState): GameSnapshot["status"] {
  if (clockState.expiredColor) {
    return "timeout";
  }

  if (chess.isCheckmate()) {
    return "checkmate";
  }

  if (chess.isStalemate()) {
    return "stalemate";
  }

  if (chess.isInsufficientMaterial()) {
    return "insufficient";
  }

  if (chess.isThreefoldRepetition()) {
    return "threefold";
  }

  if (chess.isDraw()) {
    return "draw";
  }

  return chess.history().length === 0 ? "idle" : "active";
}

function markTimeout(session: GameSession, clockState: ClockState): GameSession {
  const chess = replayMoveEntries(session.moveEntries);

  return buildSessionFromChess(
    chess,
    session.settings,
    session.redoStack,
    session.playerColor,
    clockState,
    session.analysisSummary,
  );
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const orientation: Orientation = settings.orientation === "black" ? "black" : "white";

  return {
    difficultyId: settings.difficultyId || defaultDifficultyId,
    themeId: settings.themeId || defaultThemeId,
    locale: settings.locale === "en" ? "en" : "pt-BR",
    orientation,
    clockConfig: normalizeClockConfig(settings.clockConfig),
    animationMode: settings.animationMode ?? "normal",
    defaultViewMode: settings.defaultViewMode ?? "3d",
  };
}

function normalizeUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.slice(4) || undefined,
  };
}

export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}
