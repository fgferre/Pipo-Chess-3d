import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import type { Square } from "chess.js";
import { createSceneAdapter, type SceneAdapter, type SceneLoadState } from "../scene/SceneAdapter";
import { useGameStore } from "../state/gameStore";
import type { GameSession, ThemeDefinition } from "../types/game";

interface AnchorProjection {
  square: Square | null;
  yOffset: number;
}

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
  checkSquare?: Square | null;
  onSquareSelect: (square: Square) => void;
  onPromotionAnchorChange: (anchor: { x: number; y: number } | null) => void;
  onInvalidMoveAnchorChange: (anchor: { x: number; y: number } | null) => void;
  onCheckAnchorChange?: (anchor: { x: number; y: number } | null) => void;
  onCastlingAnchorChange: (anchor: { x: number; y: number } | null) => void;
  onLoadStateChange?: (state: SceneLoadState) => void;
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
  checkSquare,
  onSquareSelect,
  onPromotionAnchorChange,
  onInvalidMoveAnchorChange,
  onCheckAnchorChange,
  onCastlingAnchorChange,
  onLoadStateChange,
}: ChessSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<SceneAdapter | null>(null);
  const handleSquareSelect = useEffectEvent(onSquareSelect);
  const handlePromotionAnchorChange = useEffectEvent(onPromotionAnchorChange);
  const handleInvalidMoveAnchorChange = useEffectEvent(onInvalidMoveAnchorChange);
  const handleCheckAnchorChange = useEffectEvent(onCheckAnchorChange ?? (() => undefined));
  const handleCastlingAnchorChange = useEffectEvent(onCastlingAnchorChange);
  const handleLoadStateChange = useEffectEvent(
    onLoadStateChange ?? (() => undefined),
  );
  const cameraPreset = useGameStore((state) => state.cameraPreset);

  // Anchor projection refs — updated on prop change and before every stage render.
  const promotionAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 1.15 });
  const invalidMoveAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.6 });
  const checkAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.9 });
  const castlingAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.7 });

  // Project anchors when props change — single shot, no RAF loop
  useEffect(() => {
    promotionAnchorRef.current = { square: promotionAnchorSquare, yOffset: 1.15 };
    if (!promotionAnchorSquare) {
      handlePromotionAnchorChange(null);
    } else {
      handlePromotionAnchorChange(
        stageRef.current?.projectSquareToViewport(promotionAnchorSquare, 1.15) ?? null,
      );
    }
  }, [promotionAnchorSquare]);

  useEffect(() => {
    invalidMoveAnchorRef.current = { square: invalidMoveSquare, yOffset: 0.6 };
    if (!invalidMoveSquare) {
      handleInvalidMoveAnchorChange(null);
    } else {
      handleInvalidMoveAnchorChange(
        stageRef.current?.projectSquareToViewport(invalidMoveSquare, 0.6) ?? null,
      );
    }
  }, [invalidMoveSquare]);

  useEffect(() => {
    const square = checkSquare ?? null;
    checkAnchorRef.current = { square, yOffset: 0.9 };
    if (!square) {
      handleCheckAnchorChange(null);
    } else {
      handleCheckAnchorChange(
        stageRef.current?.projectSquareToViewport(square, 0.9) ?? null,
      );
    }
  }, [checkSquare]);

  useEffect(() => {
    const square = castlingTargets.length > 0 ? castlingTargets[0] : null;
    castlingAnchorRef.current = { square, yOffset: 0.7 };
    if (!square) {
      handleCastlingAnchorChange(null);
    } else {
      handleCastlingAnchorChange(
        stageRef.current?.projectSquareToViewport(square, 0.7) ?? null,
      );
    }
  }, [castlingTargets]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let disposed = false;
    const stage = createSceneAdapter(containerRef.current, handleSquareSelect);
    stageRef.current = stage;
    stage.setQualityPreference({
      qualityMode: session.settings.qualityMode,
      manualQualityTier: session.settings.manualQualityTier,
    });
    stage.setShowCoordinates(session.settings.showCoordinates);
    void stage.init((state) => {
      if (!disposed) {
        handleLoadStateChange(state);
      }
    }).catch(() => {
      if (!disposed) {
        handleLoadStateChange({
          phase: "error",
          progress: 100,
          messageKey: "scene.loading.error",
        });
      }
    });

    // Re-project anchors immediately before each 3D render so overlays stay in step.
    stage.setOnBeforeRender(() => {
      const promo = promotionAnchorRef.current;
      const invalid = invalidMoveAnchorRef.current;
      const check = checkAnchorRef.current;
      const castling = castlingAnchorRef.current;
      if (!promo.square && !invalid.square && !check.square && !castling.square) {
        return;
      }

      flushSync(() => {
        if (promo.square) {
          handlePromotionAnchorChange(
            stageRef.current?.projectSquareToViewport(promo.square, promo.yOffset) ?? null,
          );
        }

        if (invalid.square) {
          handleInvalidMoveAnchorChange(
            stageRef.current?.projectSquareToViewport(invalid.square, invalid.yOffset) ?? null,
          );
        }

        if (check.square) {
          handleCheckAnchorChange(
            stageRef.current?.projectSquareToViewport(check.square, check.yOffset) ?? null,
          );
        }

        if (castling.square) {
          handleCastlingAnchorChange(
            stageRef.current?.projectSquareToViewport(castling.square, castling.yOffset) ?? null,
          );
        }
      });
    });

    const visibilityHandler = () => {
      stage.setPaused(document.hidden);
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityHandler);
      stage.setOnBeforeRender(null);
      stage.dispose();
      stageRef.current = null;
    };
    // Stage lifecycle is mount-bound; runtime setting updates are handled by dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const stageStyle = {
    "--board-backdrop": theme.backdrop,
    "--board-fog": theme.canvasFog,
    "--board-accent": theme.canvasAccent,
    "--board-felt": theme.canvasFelt,
    "--board-light": theme.boardLight,
    "--board-dark": theme.boardDark,
    "--board-frame": theme.boardFrame,
  } as CSSProperties;

  return (
    <div className="board-shell" ref={containerRef} style={stageStyle} />
  );
}
