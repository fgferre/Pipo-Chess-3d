import { useEffect, useEffectEvent, useRef } from "react";
import type { Square } from "chess.js";
import { ChessStage, type ViewportPadding } from "../scene/ChessStage";
import { useGameStore } from "../state/gameStore";
import type { GameSession, ThemeDefinition } from "../types/game";

export type { ViewportPadding } from "../scene/ChessStage";

interface ChessSceneProps {
  session: GameSession;
  theme: ThemeDefinition;
  interactionEnabled: boolean;
  viewportPadding: ViewportPadding;
  lastMove: { from: Square; to: Square } | null;
  promotionAnchorSquare: Square | null;
  selectedSquare: Square | null;
  legalTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
  onSquareSelect: (square: Square) => void;
  onPromotionAnchorChange: (anchor: { x: number; y: number } | null) => void;
}

export function ChessScene({
  session,
  theme,
  interactionEnabled,
  viewportPadding,
  lastMove,
  promotionAnchorSquare,
  selectedSquare,
  legalTargets,
  hintMove,
  onSquareSelect,
  onPromotionAnchorChange,
}: ChessSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<ChessStage | null>(null);
  const handleSquareSelect = useEffectEvent(onSquareSelect);
  const handlePromotionAnchorChange = useEffectEvent(onPromotionAnchorChange);
  const cameraPreset = useGameStore((state) => state.cameraPreset);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const stage = new ChessStage(containerRef.current, handleSquareSelect);
    stageRef.current = stage;
    void stage.init();

    const visibilityHandler = () => {
      stage.setPaused(document.hidden);
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canInteract =
      interactionEnabled &&
      session.snapshot.sideToMove === session.playerColor &&
      (session.snapshot.status === "active" || session.snapshot.status === "idle");

    stageRef.current?.update({
      fen: session.snapshot.fen,
      orientation: session.settings.orientation,
      theme,
      playerColor: session.playerColor,
      canInteract,
      lastMove,
      moveEntries: session.moveEntries,
      redoStack: session.redoStack,
      selectedSquare,
      legalTargets,
      hintMove,
    });
  }, [
    hintMove,
    legalTargets,
    selectedSquare,
    session.moveEntries,
    session.playerColor,
    session.redoStack,
    session.settings.orientation,
    session.snapshot.fen,
    session.snapshot.sideToMove,
    session.snapshot.status,
    theme,
    interactionEnabled,
    lastMove,
  ]);

  useEffect(() => {
    stageRef.current?.setAnimationMode(session.settings.animationMode);
  }, [session.settings.animationMode]);

  useEffect(() => {
    stageRef.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    stageRef.current?.setCameraSensitivity(session.settings.cameraSensitivity);
  }, [session.settings.cameraSensitivity]);

  useEffect(() => {
    stageRef.current?.setViewportPadding(viewportPadding);
  }, [viewportPadding]);

  useEffect(() => {
    if (!promotionAnchorSquare) {
      handlePromotionAnchorChange(null);
      return;
    }

    let frame = 0;
    const updateAnchor = () => {
      handlePromotionAnchorChange(stageRef.current?.projectSquareToViewport(promotionAnchorSquare, 1.15) ?? null);
      frame = window.requestAnimationFrame(updateAnchor);
    };

    updateAnchor();

    return () => {
      window.cancelAnimationFrame(frame);
      handlePromotionAnchorChange(null);
    };
  }, [promotionAnchorSquare]);

  return (
    <div
      className="board-shell"
      ref={containerRef}
      style={{
        backgroundColor: theme.canvasFog,
        backgroundImage: theme.backdrop,
      }}
    />
  );
}
