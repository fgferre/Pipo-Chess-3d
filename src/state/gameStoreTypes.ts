import type { PieceSymbol, Square } from "chess.js";
import type { QualityMode, QualityTier } from "../quality/qualityPolicy";
import type {
  AutosaveRecord,
  CameraPreset,
  EnginePhase,
  FiftyMoveRulePressure,
  GameSession,
  InteractionOutcome,
  Locale,
  LowTimeState,
  NewGameOptions,
  PendingPromotion,
  SaveSlotRecord,
} from "../types/game";

export interface HintMove {
  from: Square;
  to: Square;
  pv: string[];
}

export type QualitySettings = GameSession["settings"];
export type QualitySession = GameSession;

export interface GameStore {
  booted: boolean;
  enginePhase: EnginePhase;
  engineMessage: string;
  session: QualitySession;
  autosave: AutosaveRecord | null;
  saveSlots: SaveSlotRecord[];
  selectedSquare: Square | null;
  legalTargets: Square[];
  castlingTargets: Square[];
  hintMove: HintMove | null;
  pendingPromotion: PendingPromotion | null;
  currentRepetitionCount: number;
  fiftyMoveRulePressure: FiftyMoveRulePressure;
  lowTimeState: LowTimeState;
  analysisCursor: number | null;
  analysisAutoplay: boolean;
  analysisProgress: { completed: number; total: number; currentPly: number } | null;
  cameraPreset: CameraPreset;
  restoreNotice: string | null;
  lastError: string | null;
  bootstrap: () => Promise<void>;
  selectSquare: (square: Square) => Promise<InteractionOutcome>;
  confirmPromotion: (piece: PieceSymbol) => Promise<void>;
  requestHint: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  newGame: (options?: NewGameOptions) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  toggleOrientation: () => Promise<void>;
  setShowCoordinates: (show: boolean) => Promise<void>;
  setAnimationMode: (mode: GameSession["settings"]["animationMode"]) => Promise<void>;
  setDefaultViewMode: (mode: GameSession["settings"]["defaultViewMode"]) => Promise<void>;
  setCameraSensitivity: (cameraSensitivity: GameSession["settings"]["cameraSensitivity"]) => Promise<void>;
  setQualityMode: (mode: QualityMode) => Promise<void>;
  setQualityTier: (tier: QualityTier) => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setSoundVolume: (volume: number) => Promise<void>;
  setHapticsEnabled: (enabled: boolean) => Promise<void>;
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

export type GameStoreGet = () => GameStore;
export type GameStoreSet = (partial: Partial<GameStore>) => void;
