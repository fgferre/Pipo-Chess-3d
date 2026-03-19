import type { Square } from "chess.js";
import { ChessStage } from "./ChessStage";
import type { AppSettings, CameraPreset, GameSession, ThemeDefinition } from "../types/game";

export interface SceneRenderState {
  fen: string;
  orientation: GameSession["settings"]["orientation"];
  theme: ThemeDefinition;
  playerColor: GameSession["playerColor"];
  canInteract: boolean;
  lastMove: { from: Square; to: Square } | null;
  moveEntries: GameSession["moveEntries"];
  redoStack: GameSession["redoStack"];
  selectedSquare: Square | null;
  legalTargets: Square[];
  castlingTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
}

export interface SceneAdapter {
  init(): Promise<void>;
  update(state: SceneRenderState): void;
  setPaused(paused: boolean): void;
  setCameraPreset(preset: CameraPreset): void;
  setCameraSensitivity(sensitivity: AppSettings["cameraSensitivity"]): void;
  setAnimationMode(mode: AppSettings["animationMode"]): void;
  setQualityPreference(preference: Pick<AppSettings, "qualityMode" | "manualQualityTier">): void;
  setShowCoordinates(show: boolean): void;
  projectSquareToViewport(square: Square, yOffset?: number): { x: number; y: number } | null;
  dispose(): void;
}

export function createSceneAdapter(
  container: HTMLDivElement,
  onSquareSelect: (square: Square) => void,
): SceneAdapter {
  return new ChessStage(container, onSquareSelect);
}
