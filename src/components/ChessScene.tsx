import { useEffect, useEffectEvent, useRef } from "react";
import type { Square } from "chess.js";
import { createSceneAdapter, type SceneAdapter } from "../scene/SceneAdapter";
import { useGameStore } from "../state/gameStore";
import type { GameSession, ThemeDefinition } from "../types/game";

interface ChessSceneProps {
  session: GameSession;
  theme: ThemeDefinition;
  interactionEnabled: boolean;
  lastMove: { from: Square; to: Square } | null;
  promotionAnchorSquare: Square | null;
  selectedSquare: Square | null;
  legalTargets: Square[];
  castlingTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
  invalidMoveSquare: Square | null;
  onSquareSelect: (square: Square) => void;
  onPromotionAnchorChange: (anchor: { x: number; y: number } | null) => void;
  onInvalidMoveAnchorChange: (anchor: { x: number; y: number } | null) => void;
  onCastlingAnchorChange: (anchor: { x: number; y: number } | null) => void;
}

export function ChessScene({
  session,
  theme,
  interactionEnabled,
  lastMove,
  promotionAnchorSquare,
  selectedSquare,
  legalTargets,
  castlingTargets,
  hintMove,
  invalidMoveSquare,
  onSquareSelect,
  onPromotionAnchorChange,
  onInvalidMoveAnchorChange,
  onCastlingAnchorChange,
}: ChessSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<SceneAdapter | null>(null);
  const handleSquareSelect = useEffectEvent(onSquareSelect);
  const handlePromotionAnchorChange = useEffectEvent(onPromotionAnchorChange);
  const handleInvalidMoveAnchorChange = useEffectEvent(onInvalidMoveAnchorChange);
  const handleCastlingAnchorChange = useEffectEvent(onCastlingAnchorChange);
  const cameraPreset = useGameStore((state) => state.cameraPreset);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const stage = createSceneAdapter(containerRef.current, handleSquareSelect);
    stageRef.current = stage;
    stage.setQualityPreference({
      qualityMode: session.settings.qualityMode,
      manualQualityTier: session.settings.manualQualityTier,
    });
    stage.setShowCoordinates(session.settings.showCoordinates);
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
      castlingTargets,
      hintMove,
    });
  }, [
    hintMove,
    legalTargets,
    castlingTargets,
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
    stageRef.current?.setQualityPreference({
      qualityMode: session.settings.qualityMode,
      manualQualityTier: session.settings.manualQualityTier,
    });
  }, [session.settings.manualQualityTier, session.settings.qualityMode]);

  useEffect(() => {
    stageRef.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    stageRef.current?.setCameraSensitivity(session.settings.cameraSensitivity);
  }, [session.settings.cameraSensitivity]);

  useEffect(() => {
    stageRef.current?.setShowCoordinates(session.settings.showCoordinates);
  }, [session.settings.showCoordinates]);

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

  useEffect(() => {
    if (!invalidMoveSquare) {
      handleInvalidMoveAnchorChange(null);
      return;
    }

    let frame = 0;
    const updateAnchor = () => {
      handleInvalidMoveAnchorChange(stageRef.current?.projectSquareToViewport(invalidMoveSquare, 0.6) ?? null);
      frame = window.requestAnimationFrame(updateAnchor);
    };

    updateAnchor();

    return () => {
      window.cancelAnimationFrame(frame);
      handleInvalidMoveAnchorChange(null);
    };
  }, [invalidMoveSquare]);

  useEffect(() => {
    if (castlingTargets.length === 0) {
      handleCastlingAnchorChange(null);
      return;
    }

    let frame = 0;
    const updateAnchor = () => {
      handleCastlingAnchorChange(stageRef.current?.projectSquareToViewport(castlingTargets[0], 0.7) ?? null);
      frame = window.requestAnimationFrame(updateAnchor);
    };

    updateAnchor();

    return () => {
      window.cancelAnimationFrame(frame);
      handleCastlingAnchorChange(null);
    };
  }, [castlingTargets]);

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
