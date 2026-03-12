import { useEffect, useEffectEvent, useRef } from "react";
import type { Square } from "chess.js";
import { ChessStage } from "../scene/ChessStage";
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
    stageRef.current?.update({
      fen: session.snapshot.fen,
      orientation: session.settings.orientation,
      theme,
      selectedSquare,
      legalTargets,
      hintMove,
    });
  }, [hintMove, legalTargets, selectedSquare, session.settings.orientation, session.snapshot.fen, theme]);

  return <div className="board-shell" ref={containerRef} />;
}
