import type { Color, PieceSymbol, Square } from "chess.js";

export type Locale = "pt-BR" | "en";
export type Orientation = "white" | "black";
export type EnginePhase = "booting" | "ready" | "thinking" | "analyzing" | "error";
export type PanelId =
  | "new-game"
  | "difficulty"
  | "clock"
  | "themes"
  | "save-load"
  | "analysis"
  | "language";

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

export type MoveTag = "best" | "inaccuracy" | "mistake" | "blunder";

export interface AnalysisSummary {
  result: string;
  openingName?: string;
  criticalMoments: CriticalMoment[];
  centipawnLossBySide: Record<Color, number>;
  tagsByPly: Record<number, MoveTag>;
}

export interface AppSettings {
  difficultyId: string;
  themeId: string;
  locale: Locale;
  orientation: Orientation;
  clockConfig: ClockConfig;
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
