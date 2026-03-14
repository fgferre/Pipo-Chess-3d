import { useEffect, useEffectEvent, useRef } from "react";
import type { Square } from "chess.js";
import { ChessStage } from "../scene/ChessStage";
import { useGameStore } from "../state/gameStore";
import type { GameSession, ThemeDefinition } from "../types/game";

interface ChessSceneProps {
  session: GameSession;
  theme: ThemeDefinition;
  selectedSquare: Square | null;
  legalTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
  onSquareSelect: (square: Square) => void;
}

export function ChessScene({
  session,
  theme,
  selectedSquare,
  legalTargets,
  hintMove,
  onSquareSelect,
}: ChessSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<ChessStage | null>(null);
  const handleSquareSelect = useEffectEvent(onSquareSelect);
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
    const lastMoveEntry = session.moveEntries.at(-1);
    const canInteract =
      session.snapshot.sideToMove === session.playerColor &&
      (session.snapshot.status === "active" || session.snapshot.status === "idle");

    stageRef.current?.update({
      fen: session.snapshot.fen,
      orientation: session.settings.orientation,
      theme,
      playerColor: session.playerColor,
      canInteract,
      lastMove:
        lastMoveEntry && lastMoveEntry.color !== session.playerColor
          ? { from: lastMoveEntry.from, to: lastMoveEntry.to }
          : null,
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
  ]);

  useEffect(() => {
    stageRef.current?.setAnimationMode(session.settings.animationMode);
  }, [session.settings.animationMode]);

  useEffect(() => {
    stageRef.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset]);

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
