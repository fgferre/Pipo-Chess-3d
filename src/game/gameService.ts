import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { defaultClockConfig, normalizeClockConfig } from "../data/clocks";
import { defaultDifficultyId } from "../data/difficulties";
import { defaultThemeId } from "../data/themes";
import {
  normalizeQualitySettings,
  QUALITY_DEFAULT_TIER,
} from "../quality/qualityPolicy";
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
  const qualitySettings = normalizeQualitySettings();

  return {
    difficultyId: defaultDifficultyId,
    themeId: defaultThemeId,
    locale: "pt-BR",
    orientation: "white",
    clockConfig: defaultClockConfig,
    animationMode: "normal",
    defaultViewMode: "3d",
    cameraSensitivity: {
      rotate: 1,
      zoom: 1,
    },
    qualityMode: qualitySettings.qualityMode,
    manualQualityTier: qualitySettings.manualQualityTier,
    showCoordinates: true,
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
    session.moveEntries,
  );
}

export function sessionFromPgn(pgn: string, fallbackSettings: AppSettings): GameSession {
  const chess = new Chess();
  chess.loadPgn(pgn, { newlineChar: "\n" });
  const restored = extractSettingsFromHeaders(chess.getHeaders(), normalizeSettings(fallbackSettings));
  const normalized = normalizeSettings(restored.settings);

  return buildSessionFromChess(
    chess,
    normalized,
    [],
    restored.playerColor,
    createInitialClockState(normalized.clockConfig, chess.turn()),
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
    session.moveEntries,
  );
}

export function getLegalMovesForSquare(session: GameSession, square: Square): Square[] {
  const chess = replayMoveEntries(session.moveEntries);

  return chess.moves({ square, verbose: true }).map((move) => move.to);
}

export function getCastlingTargetsForSquare(session: GameSession, square: Square): Square[] {
  const chess = replayMoveEntries(session.moveEntries);

  return chess
    .moves({ square, verbose: true })
    .filter((move) => move.flags.includes("k") || move.flags.includes("q"))
    .map((move) => move.to);
}

export function isSessionInCheck(session: GameSession): boolean {
  const chess = replayMoveEntries(session.moveEntries);
  return chess.isCheck() && !chess.isCheckmate();
}

export function getCheckedKingSquare(session: GameSession): Square | null {
  const chess = replayMoveEntries(session.moveEntries);
  if (!chess.isCheck() || chess.isCheckmate()) {
    return null;
  }

  return chess.findPiece({ type: "k", color: chess.turn() })[0] ?? null;
}

export interface IllegalMoveDiagnosis {
  reason: "exposes-king" | "pinned" | "blocked" | "no-piece" | "unknown";
  attackerSquares: Square[];
  attackerTypes: PieceSymbol[];
}

export function diagnoseIllegalMove(
  session: GameSession,
  from: Square,
  to: Square,
): IllegalMoveDiagnosis {
  const chess = replayMoveEntries(session.moveEntries);
  const piece = chess.get(from);

  if (!piece) {
    return { reason: "no-piece", attackerSquares: [], attackerTypes: [] };
  }

  const opponent: Color = piece.color === "w" ? "b" : "w";

  // Simulate the move: place piece on target, remove from source
  const sim = new Chess();
  sim.load(chess.fen(), { skipValidation: true });
  sim.remove(from);
  sim.put({ type: piece.type, color: piece.color }, to);

  // Find the king square after the simulated move
  const kingSquare =
    piece.type === "k" ? to : sim.findPiece({ type: "k", color: piece.color })[0];

  if (kingSquare && sim.isAttacked(kingSquare, opponent)) {
    const attackers = sim.attackers(kingSquare, opponent);
    const attackerTypes = attackers.map((sq) => sim.get(sq)?.type).filter(Boolean) as PieceSymbol[];

    return {
      reason: piece.type === "k" ? "exposes-king" : "pinned",
      attackerSquares: attackers,
      attackerTypes,
    };
  }

  return { reason: "blocked", attackerSquares: [], attackerTypes: [] };
}

const PIECE_NAMES: Record<string, Record<PieceSymbol, string>> = {
  "pt-BR": { p: "Peão", r: "Torre", n: "Cavalo", b: "Bispo", q: "Dama", k: "Rei" },
  en: { p: "Pawn", r: "Rook", n: "Knight", b: "Bishop", q: "Queen", k: "King" },
};

export function formatIllegalMoveDiagnosis(
  diagnosis: IllegalMoveDiagnosis,
  locale: string,
): { summary: string; detail: string | null } {
  const names = PIECE_NAMES[locale] ?? PIECE_NAMES.en;
  const firstType = diagnosis.attackerTypes[0];
  const firstSquare = diagnosis.attackerSquares[0];
  const pieceName = firstType ? names[firstType] : null;

  switch (diagnosis.reason) {
    case "exposes-king":
      return {
        summary: locale === "pt-BR" ? "Rei em xeque" : "King in check",
        detail:
          pieceName && firstSquare
            ? locale === "pt-BR"
              ? `pelo ${pieceName} em ${firstSquare}`
              : `from ${pieceName} on ${firstSquare}`
            : null,
      };
    case "pinned":
      return {
        summary: locale === "pt-BR" ? "Peça presa" : "Pinned piece",
        detail:
          pieceName && firstSquare
            ? locale === "pt-BR"
              ? `protege o rei do ${pieceName} em ${firstSquare}`
              : `shields king from ${pieceName} on ${firstSquare}`
            : null,
      };
    case "blocked":
      return {
        summary: locale === "pt-BR" ? "Lance ilegal" : "Illegal move",
        detail: null,
      };
    default:
      return {
        summary: locale === "pt-BR" ? "Lance ilegal" : "Illegal move",
        detail: null,
      };
  }
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
  const beforeFen = chess.fen();

  if (clockState.expiredColor) {
    return markTimeout(session, clockState);
  }

  const result = chess.move({ from, to, promotion });

  if (!result) {
    return null;
  }

  const nextClockState = commitMoveOnClock(clockState, result.color, session.settings.clockConfig, timestamp);
  const finalizedClockState = finalizeClockForPosition(chess, nextClockState);
  const nextMoveEntries = [
    ...cloneMoveEntries(session.moveEntries),
    createMoveEntry(result, beforeFen, chess.fen(), session.moveEntries.length + 1, finalizedClockState),
  ];

  return buildSessionFromChess(
    chess,
    session.settings,
    [],
    session.playerColor,
    finalizedClockState,
    session.analysisSummary,
    nextMoveEntries,
  );
}

export function applyEngineMove(
  session: GameSession,
  bestMove: string,
  timestamp = Date.now(),
): GameSession {
  const chess = replayMoveEntries(session.moveEntries);
  const clockState = tickClock(session.snapshot.clockState, timestamp);
  const beforeFen = chess.fen();
  const normalized = normalizeUci(bestMove);
  const mover = session.snapshot.sideToMove;

  if (clockState.expiredColor) {
    return markTimeout(session, clockState);
  }

  const result = chess.move({
    from: normalized.from,
    to: normalized.to,
    promotion: normalized.promotion,
  });
  if (!result) {
    return session;
  }

  const nextClockState = commitMoveOnClock(clockState, mover, session.settings.clockConfig, timestamp);
  const finalizedClockState = finalizeClockForPosition(chess, nextClockState);
  const nextMoveEntries = [
    ...cloneMoveEntries(session.moveEntries),
    createMoveEntry(result, beforeFen, chess.fen(), session.moveEntries.length + 1, finalizedClockState),
  ];
  return buildSessionFromChess(
    chess,
    session.settings,
    [],
    session.playerColor,
    finalizedClockState,
    session.analysisSummary,
    nextMoveEntries,
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
    getClockStateAtPly(remaining, session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
    remaining,
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
    getClockStateAtPly(combined, session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
    combined,
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
    session.moveEntries,
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
    getClockStateAtPly(moveEntries, session.settings.clockConfig, chess.turn()),
    session.analysisSummary,
    moveEntries,
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
  moveEntriesOverride?: SerializableMove[],
): GameSession {
  const moveEntries = moveEntriesOverride ? cloneMoveEntries(moveEntriesOverride) : serializeHistory(chess);
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
    lastTickAt: null,
    running: false,
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
    session.moveEntries,
  );
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const orientation: Orientation = settings.orientation === "black" ? "black" : "white";
  const qualitySettings = normalizeQualitySettings({
    qualityMode: settings.qualityMode,
    manualQualityTier: settings.manualQualityTier ?? QUALITY_DEFAULT_TIER,
  });

  return {
    difficultyId: settings.difficultyId || defaultDifficultyId,
    themeId: settings.themeId || defaultThemeId,
    locale: settings.locale === "en" ? "en" : "pt-BR",
    orientation,
    clockConfig: normalizeClockConfig(settings.clockConfig),
    animationMode: settings.animationMode ?? "normal",
    defaultViewMode: settings.defaultViewMode ?? "3d",
    cameraSensitivity: normalizeCameraSensitivity(settings.cameraSensitivity),
    qualityMode: qualitySettings.qualityMode,
    manualQualityTier: qualitySettings.manualQualityTier,
    showCoordinates: settings.showCoordinates ?? true,
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

function cloneClockState(clockState: ClockState): ClockState {
  return { ...clockState };
}

function cloneMoveEntry(move: SerializableMove): SerializableMove {
  return {
    ...move,
    clockStateAfter: move.clockStateAfter ? cloneClockState(move.clockStateAfter) : undefined,
  };
}

function cloneMoveEntries(moveEntries: SerializableMove[]): SerializableMove[] {
  return moveEntries.map(cloneMoveEntry);
}

function createMoveEntry(
  move: Move,
  beforeFen: string,
  afterFen: string,
  ply: number,
  clockStateAfter: ClockState,
): SerializableMove {
  return {
    ply,
    color: move.color,
    piece: move.piece,
    san: move.san,
    uci: moveToUci(move),
    from: move.from,
    to: move.to,
    beforeFen,
    afterFen,
    captured: move.captured,
    promotion: move.promotion,
    clockStateAfter: cloneClockState(clockStateAfter),
  };
}

function getClockStateAtPly(
  moveEntries: SerializableMove[],
  clockConfig: ClockConfig,
  activeColor: Color,
): ClockState {
  const lastClockState = moveEntries.at(-1)?.clockStateAfter;
  if (!lastClockState) {
    return createInitialClockState(clockConfig, activeColor);
  }

  if (lastClockState.expiredColor || !lastClockState.activeColor) {
    return cloneClockState(lastClockState);
  }

  return resumeClock({
    ...cloneClockState(lastClockState),
    running: false,
    lastTickAt: null,
  });
}

function normalizeCameraSensitivity(settings?: Partial<AppSettings["cameraSensitivity"]>): AppSettings["cameraSensitivity"] {
  return {
    rotate: Math.min(1.75, Math.max(0.5, settings?.rotate ?? 1)),
    zoom: Math.min(1.75, Math.max(0.5, settings?.zoom ?? 1)),
  };
}
