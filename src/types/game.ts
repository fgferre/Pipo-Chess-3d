import type { Color, PieceSymbol, Square } from "chess.js";
import type { QualityMode, QualityTier } from "../quality/qualityPolicy";

export type Locale = "pt-BR" | "en";
export type Orientation = "white" | "black";
export type EnginePhase = "booting" | "ready" | "thinking" | "analyzing" | "error";
export type CameraPreset = "classic" | "side" | "topdown" | "2d";
export type NewGameColorChoice = "white" | "black" | "random";
export type InteractionBlockReason =
  | "opponent-piece"
  | "out-of-turn"
  | "promotion-pending"
  | "analysis-active"
  | "inactive-session";

export interface ClockConfig {
  enabled: boolean;
  label: string;
  baseMs: number;
  incrementMs: number;
}

export interface ClockState {
  whiteMs: number;
  blackMs: number;
  activeColor: Color | null;
  lastTickAt: number | null;
  running: boolean;
  expiredColor: Color | null;
}

export interface CameraSensitivity {
  rotate: number;
  zoom: number;
}

export interface DifficultyPreset {
  id: string;
  label: string;
  uciElo: number | null;
  skillLevelFallback: number;
  moveTimeMs: number;
  hintTimeMs: number;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  boardLight: string;
  boardDark: string;
  boardFrame: string;
  whitePiece: string;
  blackPiece: string;
  highlightPrimary: string;
  highlightSecondary: string;
  hudBackground: string;
  hudBorder: string;
  textPrimary: string;
  textMuted: string;
  backdrop: string;
  backdropGlow: string;
  canvasAccent: string;
  canvasFelt: string;
  canvasFog: string;
}

export interface SerializableMove {
  ply: number;
  color: Color;
  piece: PieceSymbol;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  beforeFen: string;
  afterFen: string;
  captured?: PieceSymbol;
  promotion?: PieceSymbol;
  clockStateAfter?: ClockState;
}

export interface GameSnapshot {
  fen: string;
  pgn: string;
  moveList: SerializableMove[];
  sideToMove: Color;
  status:
    | "idle"
    | "active"
    | "checkmate"
    | "stalemate"
    | "draw"
    | "threefold"
    | "insufficient"
    | "timeout";
  orientation: Orientation;
  clockState: ClockState;
  difficultyId: string;
  themeId: string;
  locale: Locale;
  canUndo: boolean;
  canRedo: boolean;
}

export type IllegalMoveReason =
  | "exposes-king"
  | "pinned"
  | "blocked"
  | "no-piece"
  | "occupied-by-friendly"
  | "invalid-pattern"
  | "pawn-forward-blocked"
  | "pawn-double-step-blocked"
  | "pawn-diagonal-capture-required"
  | "castling-no-rights"
  | "castling-blocked"
  | "castling-through-check"
  | "castling-while-in-check"
  | "unknown";

export interface IllegalMoveDiagnosis {
  reason: IllegalMoveReason;
  piece?: PieceSymbol | null;
  attackerSquares: readonly Square[];
  attackerTypes: readonly PieceSymbol[];
  relatedSquares?: readonly Square[];
  castlingSide?: "king" | "queen" | null;
}

export interface FormattedIllegalMoveDiagnosis {
  summary: string;
  detail: string | null;
}

export interface InteractionSelectionState {
  selectedSquare: Square | null;
  legalTargets: Square[];
  castlingTargets: Square[];
}

export type InteractionOutcome =
  | {
      kind: "ignored";
      selection: InteractionSelectionState;
    }
  | {
      kind: "blocked";
      reason: InteractionBlockReason;
      square: Square;
      selection: InteractionSelectionState;
    }
  | {
      kind: "clear";
      selection: InteractionSelectionState;
    }
  | {
      kind: "select";
      square: Square;
      selection: InteractionSelectionState;
    }
  | {
      kind: "move";
      from: Square;
      to: Square;
      selection: InteractionSelectionState;
    }
  | {
      kind: "promotion";
      pendingPromotion: PendingPromotion;
      selection: InteractionSelectionState;
    }
  | {
      kind: "illegal";
      from: Square;
      to: Square;
      diagnosis: IllegalMoveDiagnosis;
      selection: InteractionSelectionState;
    };

export interface FiftyMoveRulePressure {
  halfmoveClock: number;
  state: "normal" | "warning" | "critical" | "draw";
}

export interface LowTimeState {
  thresholdMs: number;
  byColor: Record<Color, boolean>;
}

export interface CriticalMoment {
  ply: number;
  moveUci: string;
  san: string;
  tag: MoveTag;
  swingCp: number;
  bestLine: string[];
  scoreCp: number | null;
  scoreMate: number | null;
}

export type MoveTag = "brilliant" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface PositionEvaluation {
  scoreCp: number | null;
  scoreMate: number | null;
}

export interface AnalysisSummary {
  result: string;
  openingName?: string;
  criticalMoments: CriticalMoment[];
  centipawnLossBySide: Record<Color, number>;
  tagsByPly: Record<number, MoveTag>;
  evaluationsByPly?: Record<number, PositionEvaluation>;
}

export interface AppSettings {
  difficultyId: string;
  themeId: string;
  locale: Locale;
  orientation: Orientation;
  clockConfig: ClockConfig;
  animationMode: 'normal' | 'reduced' | 'off';
  defaultViewMode: '3d' | '2d';
  cameraSensitivity: CameraSensitivity;
  qualityMode: QualityMode;
  manualQualityTier: QualityTier;
  showCoordinates: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  hapticsEnabled: boolean;
}

export interface GameSession {
  snapshot: GameSnapshot;
  moveEntries: SerializableMove[];
  redoStack: SerializableMove[][];
  settings: AppSettings;
  playerColor: Color;
  analysisSummary?: AnalysisSummary;
}

export interface AutosaveRecord {
  updatedAt: string;
  session: GameSession;
}

export interface SaveSlotRecord {
  id?: number;
  label: string;
  createdAt: string;
  updatedAt: string;
  session: GameSession;
}

export interface AnalysisRecord {
  id?: number;
  createdAt: string;
  summary: AnalysisSummary;
  pgn: string;
}

export interface EngineEvaluation {
  bestMove: string;
  pv: string[];
  scoreCp: number | null;
  mate: number | null;
  depth: number | null;
}

export interface AnalysisWorkItem {
  ply: number;
  fenBefore: string;
  fenAfter: string;
  playedMoveUci: string;
  san: string;
  mover: Color;
}

export interface EngineAnalysisPayload {
  result: string;
  workItems: AnalysisWorkItem[];
}

export interface EngineInfoSnapshot {
  bestMove: string | null;
  pv: string[];
  scoreCp: number | null;
  mate: number | null;
  depth: number | null;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
  anchorSquare: Square;
}

export interface AnalysisCursorState {
  cursor: number | null;
  autoplay: boolean;
}

export interface NewGameOptions {
  playerColor: NewGameColorChoice;
  difficultyId: string;
  clockConfig: ClockConfig;
}
