import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { defaultClockConfig, normalizeClockConfig } from "../data/clocks";
import { defaultDifficultyId } from "../data/difficulties";
import { defaultThemeId } from "../data/themes";
import {
  normalizeQualitySettings,
  QUALITY_DEFAULT_TIER,
} from "../quality/qualityPolicy";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n/dictionaries";
import type {
  AppSettings,
  ClockConfig,
  ClockState,
  FiftyMoveRulePressure,
  FormattedIllegalMoveDiagnosis,
  GameSession,
  GameSnapshot,
  IllegalMoveDiagnosis,
  InteractionSelectionState,
  InteractionOutcome,
  Locale,
  LowTimeState,
  Orientation,
  SerializableMove,
} from "../types/game";
import { buildPgn, extractSettingsFromHeaders } from "./pgn";

const DEFAULT_PLAYER_COLOR: Color = "w";
const START_FEN = new Chess().fen();
const CASTLING_HOME = {
  w: {
    king: "e1" as Square,
    kingsideRook: "h1" as Square,
    queensideRook: "a1" as Square,
    kingsideTarget: "g1" as Square,
    queensideTarget: "c1" as Square,
    kingsideThrough: "f1" as Square,
    queensideThrough: "d1" as Square,
    kingsidePath: ["f1", "g1"] as Square[],
    queensidePath: ["d1", "c1", "b1"] as Square[],
  },
  b: {
    king: "e8" as Square,
    kingsideRook: "h8" as Square,
    queensideRook: "a8" as Square,
    kingsideTarget: "g8" as Square,
    queensideTarget: "c8" as Square,
    kingsideThrough: "f8" as Square,
    queensideThrough: "d8" as Square,
    kingsidePath: ["f8", "g8"] as Square[],
    queensidePath: ["d8", "c8", "b8"] as Square[],
  },
} as const;
const PIECE_LABEL_KEYS: Record<PieceSymbol, TranslationKey> = {
  p: "piece.p",
  r: "piece.r",
  n: "piece.n",
  b: "piece.b",
  q: "piece.q",
  k: "piece.k",
};

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
    soundEnabled: true,
    soundVolume: 0.72,
    hapticsEnabled: true,
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
  if (!chess.isCheck()) {
    return null;
  }

  return chess.findPiece({ type: "k", color: chess.turn() })[0] ?? null;
}

export function resolveSquareInteraction(
  session: GameSession,
  selectedSquare: Square | null,
  square: Square,
): InteractionOutcome {
  const chess = replayMoveEntries(session.moveEntries);
  const clickedPiece = chess.get(square);
  const clickedIsPlayerPiece = clickedPiece?.color === session.playerColor;
  const emptySelection = createSelectionState(session, null);

  if (!selectedSquare) {
    if (clickedIsPlayerPiece) {
      return {
        kind: "select",
        square,
        selection: createSelectionState(session, square),
      };
    }

    return {
      kind: "ignored",
      selection: emptySelection,
    };
  }

  const legalTargets = getLegalMovesForSquare(session, selectedSquare);
  if (legalTargets.includes(square)) {
    const movingPiece = chess.get(selectedSquare);
    const isPromotion =
      movingPiece?.type === "p" &&
      ((movingPiece.color === "w" && square.endsWith("8")) ||
        (movingPiece.color === "b" && square.endsWith("1")));

    if (isPromotion) {
      return {
        kind: "promotion",
        pendingPromotion: {
          from: selectedSquare,
          to: square,
          anchorSquare: square,
        },
        selection: emptySelection,
      };
    }

    return {
      kind: "move",
      from: selectedSquare,
      to: square,
      selection: emptySelection,
    };
  }

  if (clickedIsPlayerPiece) {
    return {
      kind: "select",
      square,
      selection: createSelectionState(session, square),
    };
  }

  return {
    kind: "illegal",
    from: selectedSquare,
    to: square,
    diagnosis: diagnoseIllegalMove(session, selectedSquare, square),
    selection: createSelectionState(session, selectedSquare),
  };
}

export function diagnoseIllegalMove(
  session: GameSession,
  from: Square,
  to: Square,
): IllegalMoveDiagnosis {
  const chess = replayMoveEntries(session.moveEntries);
  const piece = chess.get(from);

  if (!piece) {
    return createIllegalMoveDiagnosis("no-piece", {
      relatedSquares: [from],
    });
  }

  const targetPiece = chess.get(to);
  if (targetPiece?.color === piece.color) {
    return createIllegalMoveDiagnosis("occupied-by-friendly", {
      piece: piece.type,
      relatedSquares: [to],
    });
  }

  const castlingDiagnosis = diagnoseCastlingAttempt(chess, piece, from, to);
  if (castlingDiagnosis) {
    return castlingDiagnosis;
  }

  const piecePatternDiagnosis = diagnosePiecePattern(chess, piece, from, to);
  if (piecePatternDiagnosis) {
    return piecePatternDiagnosis;
  }

  const kingSafetyDiagnosis = diagnoseKingSafety(chess, piece, from, to);
  if (kingSafetyDiagnosis) {
    return kingSafetyDiagnosis;
  }

  return createIllegalMoveDiagnosis("unknown", {
    piece: piece.type,
    relatedSquares: [to],
  });
}

export function formatIllegalMoveDiagnosis(
  diagnosis: IllegalMoveDiagnosis,
  locale: Locale | string,
): FormattedIllegalMoveDiagnosis {
  const normalizedLocale = normalizeLocale(locale);
  const firstAttackerSquare = diagnosis.attackerSquares[0];
  const firstRelatedSquare = diagnosis.relatedSquares?.[0];
  const attackerPieceName = getPieceLabel(normalizedLocale, diagnosis.attackerTypes[0]);
  const movedPieceName = getPieceLabel(normalizedLocale, diagnosis.piece);

  switch (diagnosis.reason) {
    case "no-piece":
      return {
        summary: t(normalizedLocale, "diagnosis.noPiece.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.noPiece.detail", { square: firstRelatedSquare })
          : null,
      };
    case "exposes-king":
      return {
        summary: t(normalizedLocale, "diagnosis.exposesKing.summary"),
        detail:
          attackerPieceName && firstAttackerSquare
            ? t(normalizedLocale, "diagnosis.exposesKing.detail", {
                piece: attackerPieceName,
                square: firstAttackerSquare,
              })
            : null,
      };
    case "pinned":
      return {
        summary: t(normalizedLocale, "diagnosis.pinned.summary"),
        detail:
          attackerPieceName && firstAttackerSquare
            ? t(normalizedLocale, "diagnosis.pinned.detail", {
                piece: attackerPieceName,
                square: firstAttackerSquare,
              })
            : null,
      };
    case "blocked":
      return {
        summary: t(normalizedLocale, "diagnosis.blocked.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.blocked.detail", { square: firstRelatedSquare })
          : null,
      };
    case "occupied-by-friendly":
      return {
        summary: t(normalizedLocale, "diagnosis.occupiedByFriendly.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.occupiedByFriendly.detail", { square: firstRelatedSquare })
          : null,
      };
    case "invalid-pattern":
      return {
        summary: t(normalizedLocale, "diagnosis.invalidPattern.summary"),
        detail: movedPieceName
          ? t(normalizedLocale, "diagnosis.invalidPattern.detail", { piece: movedPieceName })
          : null,
      };
    case "pawn-forward-blocked":
      return {
        summary: t(normalizedLocale, "diagnosis.pawnForwardBlocked.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.pawnForwardBlocked.detail", { square: firstRelatedSquare })
          : null,
      };
    case "pawn-double-step-blocked":
      return {
        summary: t(normalizedLocale, "diagnosis.pawnDoubleStepBlocked.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.pawnDoubleStepBlocked.detail", { square: firstRelatedSquare })
          : null,
      };
    case "pawn-diagonal-capture-required":
      return {
        summary: t(normalizedLocale, "diagnosis.pawnDiagonalCaptureRequired.summary"),
        detail: t(normalizedLocale, "diagnosis.pawnDiagonalCaptureRequired.detail"),
      };
    case "castling-no-rights":
      return {
        summary: t(normalizedLocale, "diagnosis.castlingNoRights.summary"),
        detail: t(normalizedLocale, "diagnosis.castlingNoRights.detail"),
      };
    case "castling-blocked":
      return {
        summary: t(normalizedLocale, "diagnosis.castlingBlocked.summary"),
        detail: firstRelatedSquare
          ? t(normalizedLocale, "diagnosis.castlingBlocked.detail", { square: firstRelatedSquare })
          : null,
      };
    case "castling-through-check":
      return {
        summary: t(normalizedLocale, "diagnosis.castlingThroughCheck.summary"),
        detail:
          firstRelatedSquare && attackerPieceName && firstAttackerSquare
            ? t(normalizedLocale, "diagnosis.castlingThroughCheck.detail", {
                square: firstRelatedSquare,
                piece: attackerPieceName,
                attackerSquare: firstAttackerSquare,
              })
            : null,
      };
    case "castling-while-in-check":
      return {
        summary: t(normalizedLocale, "diagnosis.castlingWhileInCheck.summary"),
        detail: t(normalizedLocale, "diagnosis.castlingWhileInCheck.detail"),
      };
    default:
      return {
        summary: t(normalizedLocale, "diagnosis.unknown.summary"),
        detail: t(normalizedLocale, "diagnosis.unknown.detail"),
      };
  }
}

export function getCurrentRepetitionCount(session: GameSession): number {
  const positions = getRepetitionPositions(session);
  const currentKey = positions.at(-1);
  if (!currentKey) {
    return 0;
  }

  return positions.filter((position) => position === currentKey).length;
}

export function getHalfmoveClock(session: GameSession): number {
  return Number.parseInt(session.snapshot.fen.split(" ")[4] ?? "0", 10) || 0;
}

export function getFiftyMoveRulePressure(session: GameSession): FiftyMoveRulePressure {
  const halfmoveClock = getHalfmoveClock(session);
  if (halfmoveClock >= 100) {
    return { halfmoveClock, state: "draw" };
  }

  if (halfmoveClock >= 98) {
    return { halfmoveClock, state: "critical" };
  }

  if (halfmoveClock >= 96) {
    return { halfmoveClock, state: "warning" };
  }

  return { halfmoveClock, state: "normal" };
}

export function getLowTimeState(session: GameSession, thresholdMs = 30_000): LowTimeState {
  if (!session.settings.clockConfig.enabled) {
    return {
      thresholdMs,
      byColor: { w: false, b: false },
    };
  }

  return {
    thresholdMs,
    byColor: {
      w:
        session.snapshot.clockState.whiteMs > 0 &&
        session.snapshot.clockState.whiteMs <= thresholdMs,
      b:
        session.snapshot.clockState.blackMs > 0 &&
        session.snapshot.clockState.blackMs <= thresholdMs,
    },
  };
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
    soundEnabled: settings.soundEnabled ?? true,
    soundVolume: Math.min(1, Math.max(0, settings.soundVolume ?? 0.72)),
    hapticsEnabled: settings.hapticsEnabled ?? true,
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

function createSelectionState(session: GameSession, selectedSquare: Square | null): InteractionSelectionState {
  if (!selectedSquare) {
    return {
      selectedSquare: null,
      legalTargets: [],
      castlingTargets: [],
    };
  }

  return {
    selectedSquare,
    legalTargets: getLegalMovesForSquare(session, selectedSquare),
    castlingTargets: getCastlingTargetsForSquare(session, selectedSquare),
  };
}

function diagnoseCastlingAttempt(
  chess: Chess,
  piece: { type: PieceSymbol; color: Color },
  from: Square,
  to: Square,
): IllegalMoveDiagnosis | null {
  if (!isCastlingAttempt(piece, from, to)) {
    return null;
  }

  const home = CASTLING_HOME[piece.color];
  const castlingSide = fileIndex(to) > fileIndex(from) ? "king" : "queen";
  const rookSquare = castlingSide === "king" ? home.kingsideRook : home.queensideRook;
  const throughSquare = castlingSide === "king" ? home.kingsideThrough : home.queensideThrough;
  const targetSquare = castlingSide === "king" ? home.kingsideTarget : home.queensideTarget;
  const pathSquares = castlingSide === "king" ? home.kingsidePath : home.queensidePath;
  const opponent: Color = piece.color === "w" ? "b" : "w";

  const rook = chess.get(rookSquare);
  const rights = chess.getCastlingRights(piece.color);
  const hasRights = castlingSide === "king" ? rights.k : rights.q;
  if (from !== home.king || !rook || rook.color !== piece.color || rook.type !== "r" || !hasRights) {
    return createIllegalMoveDiagnosis("castling-no-rights", {
      piece: piece.type,
      castlingSide,
    });
  }

  const occupiedPath = pathSquares.filter((square) => chess.get(square));
  if (occupiedPath.length > 0) {
    return createIllegalMoveDiagnosis("castling-blocked", {
      piece: piece.type,
      relatedSquares: occupiedPath,
      castlingSide,
    });
  }

  if (chess.isCheck()) {
    return buildAttackDiagnosis(chess, from, opponent, "castling-while-in-check", {
      piece: piece.type,
      castlingSide,
    });
  }

  if (chess.isAttacked(throughSquare, opponent) || chess.isAttacked(targetSquare, opponent)) {
    const attackedSquares = [throughSquare, targetSquare].filter((square) =>
      chess.isAttacked(square, opponent),
    );

    return buildAttackDiagnosis(chess, attackedSquares[0] ?? throughSquare, opponent, "castling-through-check", {
      piece: piece.type,
      relatedSquares: attackedSquares,
      castlingSide,
    });
  }

  return null;
}

function buildAttackDiagnosis(
  chess: Chess,
  attackedSquare: Square,
  opponent: Color,
  reason: IllegalMoveDiagnosis["reason"],
  options: Partial<IllegalMoveDiagnosis> = {},
): IllegalMoveDiagnosis {
  const attackerSquares = chess.attackers(attackedSquare, opponent);
  const attackerTypes = attackerSquares
    .map((square) => chess.get(square)?.type)
    .filter(Boolean) as PieceSymbol[];

  return createIllegalMoveDiagnosis(reason, {
    ...options,
    reason,
    attackerSquares,
    attackerTypes,
    relatedSquares: options.relatedSquares?.length ? options.relatedSquares : [attackedSquare],
  });
}

function getRepetitionPositions(session: GameSession): string[] {
  const initialFen = session.moveEntries[0]?.beforeFen ?? START_FEN;
  return [
    normalizeRepetitionFen(initialFen),
    ...session.moveEntries.map((move) => normalizeRepetitionFen(move.afterFen)),
  ];
}

function normalizeRepetitionFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function diagnosePiecePattern(
  chess: Chess,
  piece: { type: PieceSymbol; color: Color },
  from: Square,
  to: Square,
): IllegalMoveDiagnosis | null {
  if (piece.type === "p") {
    return diagnosePawnPattern(chess, piece.color, from, to);
  }

  const deltaFile = Math.abs(fileIndex(to) - fileIndex(from));
  const deltaRank = Math.abs(rankIndex(to) - rankIndex(from));

  switch (piece.type) {
    case "n":
      return deltaFile === 1 && deltaRank === 2 || deltaFile === 2 && deltaRank === 1
        ? null
        : createIllegalMoveDiagnosis("invalid-pattern", { piece: piece.type, relatedSquares: [to] });
    case "b":
      if (deltaFile !== deltaRank) {
        return createIllegalMoveDiagnosis("invalid-pattern", { piece: piece.type, relatedSquares: [to] });
      }
      break;
    case "r":
      if (deltaFile !== 0 && deltaRank !== 0) {
        return createIllegalMoveDiagnosis("invalid-pattern", { piece: piece.type, relatedSquares: [to] });
      }
      break;
    case "q":
      if (deltaFile !== deltaRank && deltaFile !== 0 && deltaRank !== 0) {
        return createIllegalMoveDiagnosis("invalid-pattern", { piece: piece.type, relatedSquares: [to] });
      }
      break;
    case "k":
      if (deltaFile > 1 || deltaRank > 1 || (deltaFile === 0 && deltaRank === 0)) {
        return createIllegalMoveDiagnosis("invalid-pattern", { piece: piece.type, relatedSquares: [to] });
      }
      return null;
  }

  const blockers = getPathSquares(from, to).filter((square) => chess.get(square));
  if (blockers.length > 0) {
    return createIllegalMoveDiagnosis("blocked", {
      piece: piece.type,
      relatedSquares: blockers,
    });
  }

  return null;
}

function diagnosePawnPattern(
  chess: Chess,
  color: Color,
  from: Square,
  to: Square,
): IllegalMoveDiagnosis | null {
  const forward = color === "w" ? 1 : -1;
  const deltaFile = fileIndex(to) - fileIndex(from);
  const deltaRank = rankIndex(to) - rankIndex(from);
  const targetPiece = chess.get(to);
  const enPassantSquare = getEnPassantSquare(chess.fen());

  if (deltaFile === 0 && deltaRank === forward) {
    return targetPiece
      ? createIllegalMoveDiagnosis("pawn-forward-blocked", {
          piece: "p",
          relatedSquares: [to],
        })
      : null;
  }

  if (deltaFile === 0 && deltaRank === forward * 2 && isPawnHomeRank(color, from)) {
    const intermediateSquare = squareFrom(fileIndex(from), rankIndex(from) + forward);
    const blockers = [intermediateSquare, to].filter(
      (square): square is Square => square !== null && Boolean(chess.get(square)),
    );

    return blockers.length > 0
      ? createIllegalMoveDiagnosis("pawn-double-step-blocked", {
          piece: "p",
          relatedSquares: blockers,
        })
      : null;
  }

  if (Math.abs(deltaFile) === 1 && deltaRank === forward) {
    if (targetPiece && targetPiece.color !== color) {
      return null;
    }

    if (!targetPiece && enPassantSquare === to) {
      return null;
    }

    return createIllegalMoveDiagnosis("pawn-diagonal-capture-required", {
      piece: "p",
      relatedSquares: [to],
    });
  }

  return createIllegalMoveDiagnosis("invalid-pattern", {
    piece: "p",
    relatedSquares: [to],
  });
}

function diagnoseKingSafety(
  chess: Chess,
  piece: { type: PieceSymbol; color: Color },
  from: Square,
  to: Square,
): IllegalMoveDiagnosis | null {
  const opponent: Color = piece.color === "w" ? "b" : "w";
  const simulated = simulateMove(chess, piece, from, to);
  const kingSquare = piece.type === "k" ? to : simulated.findPiece({ type: "k", color: piece.color })[0];

  if (!kingSquare || !simulated.isAttacked(kingSquare, opponent)) {
    return null;
  }

  return buildAttackDiagnosis(simulated, kingSquare, opponent, piece.type === "k" ? "exposes-king" : "pinned", {
    piece: piece.type,
  });
}

function simulateMove(
  chess: Chess,
  piece: { type: PieceSymbol; color: Color },
  from: Square,
  to: Square,
): Chess {
  const simulated = new Chess();
  simulated.load(chess.fen(), { skipValidation: true });
  simulated.remove(from);

  if (piece.type === "p" && fileIndex(from) !== fileIndex(to) && !chess.get(to)) {
    const enPassantSquare = getEnPassantSquare(chess.fen());
    if (enPassantSquare === to) {
      const capturedSquare = squareFrom(fileIndex(to), rankIndex(from));
      if (capturedSquare) {
        simulated.remove(capturedSquare);
      }
    }
  }

  simulated.remove(to);
  simulated.put({ type: piece.type, color: piece.color }, to);
  return simulated;
}

function createIllegalMoveDiagnosis(
  reason: IllegalMoveDiagnosis["reason"],
  options: Partial<IllegalMoveDiagnosis> = {},
): IllegalMoveDiagnosis {
  return {
    reason,
    piece: options.piece ?? null,
    attackerSquares: options.attackerSquares ?? [],
    attackerTypes: options.attackerTypes ?? [],
    relatedSquares: options.relatedSquares ?? [],
    castlingSide: options.castlingSide ?? null,
  };
}

function getPieceLabel(locale: Locale, piece: PieceSymbol | null | undefined): string | null {
  if (!piece) {
    return null;
  }

  return t(locale, PIECE_LABEL_KEYS[piece]);
}

function normalizeLocale(locale: Locale | string): Locale {
  return locale === "pt-BR" ? "pt-BR" : "en";
}

function isCastlingAttempt(
  piece: { type: PieceSymbol; color: Color },
  from: Square,
  to: Square,
): boolean {
  const home = CASTLING_HOME[piece.color];
  return (
    piece.type === "k" &&
    from === home.king &&
    from[1] === to[1] &&
    Math.abs(fileIndex(to) - fileIndex(from)) === 2
  );
}

function getPathSquares(from: Square, to: Square): Square[] {
  const deltaFile = Math.sign(fileIndex(to) - fileIndex(from));
  const deltaRank = Math.sign(rankIndex(to) - rankIndex(from));
  const path: Square[] = [];
  let currentFile = fileIndex(from) + deltaFile;
  let currentRank = rankIndex(from) + deltaRank;

  while (currentFile !== fileIndex(to) || currentRank !== rankIndex(to)) {
    const square = squareFrom(currentFile, currentRank);
    if (square) {
      path.push(square);
    }
    currentFile += deltaFile;
    currentRank += deltaRank;
  }

  return path;
}

function getEnPassantSquare(fen: string): Square | null {
  const enPassant = fen.split(" ")[3];
  return enPassant && enPassant !== "-" ? (enPassant as Square) : null;
}

function isPawnHomeRank(color: Color, square: Square): boolean {
  return color === "w" ? square.endsWith("2") : square.endsWith("7");
}

function rankIndex(square: Square): number {
  return Number.parseInt(square[1], 10);
}

function fileIndex(square: Square): number {
  return square.charCodeAt(0) - "a".charCodeAt(0);
}

function squareFrom(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) {
    return null;
  }

  return `${String.fromCharCode("a".charCodeAt(0) + file)}${rank}` as Square;
}
