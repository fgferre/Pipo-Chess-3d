import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import type { Square } from "chess.js";
import { createSceneAdapter, type SceneAdapter, type SceneLoadState } from "../scene/SceneAdapter";
import { useGameStore } from "../state/gameStore";
import type { GameSession, ThemeDefinition } from "../types/game";

interface AnchorProjection {
  square: Square | null;
  yOffset: number;
}

interface ViewportAnchor {
  x: number;
  y: number;
}

interface ProjectedAnchors {
  promotion: ViewportAnchor | null;
  invalidMove: ViewportAnchor | null;
  check: ViewportAnchor | null;
  castling: ViewportAnchor | null;
}

const PROJECTED_ANCHOR_EPSILON_PX = 0.5;
const EMPTY_PROJECTED_ANCHORS: ProjectedAnchors = {
  promotion: null,
  invalidMove: null,
  check: null,
  castling: null,
};

function projectAnchor(
  stage: SceneAdapter | null,
  anchor: AnchorProjection,
): ViewportAnchor | null {
  return anchor.square ? stage?.projectSquareToViewport(anchor.square, anchor.yOffset) ?? null : null;
}

function areViewportAnchorsEqual(
  previous: ViewportAnchor | null,
  next: ViewportAnchor | null,
): boolean {
  if (previous === next) {
    return true;
  }

  if (!previous || !next) {
    return previous === next;
  }

  return (
    Math.abs(previous.x - next.x) < PROJECTED_ANCHOR_EPSILON_PX &&
    Math.abs(previous.y - next.y) < PROJECTED_ANCHOR_EPSILON_PX
  );
}

function areProjectedAnchorsEqual(
  previous: ProjectedAnchors,
  next: ProjectedAnchors,
): boolean {
  return (
    areViewportAnchorsEqual(previous.promotion, next.promotion) &&
    areViewportAnchorsEqual(previous.invalidMove, next.invalidMove) &&
    areViewportAnchorsEqual(previous.check, next.check) &&
    areViewportAnchorsEqual(previous.castling, next.castling)
  );
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
  const anchorProjectionFrameRef = useRef<number | null>(null);
  const queuedAnchorsRef = useRef<ProjectedAnchors>(EMPTY_PROJECTED_ANCHORS);
  const publishedAnchorsRef = useRef<ProjectedAnchors>(EMPTY_PROJECTED_ANCHORS);

  // Anchor projection refs — updated on prop change and sampled from the stage render loop.
  const promotionAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 1.15 });
  const invalidMoveAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.6 });
  const checkAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.9 });
  const castlingAnchorRef = useRef<AnchorProjection>({ square: null, yOffset: 0.7 });

  const publishProjectedAnchors = useEffectEvent((anchors: ProjectedAnchors) => {
    queuedAnchorsRef.current = anchors;
    if (areProjectedAnchorsEqual(publishedAnchorsRef.current, anchors)) {
      return;
    }

    publishedAnchorsRef.current = anchors;
    handlePromotionAnchorChange(anchors.promotion);
    handleInvalidMoveAnchorChange(anchors.invalidMove);
    handleCheckAnchorChange(anchors.check);
    handleCastlingAnchorChange(anchors.castling);
  });

  const readProjectedAnchors = useEffectEvent((): ProjectedAnchors => ({
    promotion: projectAnchor(stageRef.current, promotionAnchorRef.current),
    invalidMove: projectAnchor(stageRef.current, invalidMoveAnchorRef.current),
    check: projectAnchor(stageRef.current, checkAnchorRef.current),
    castling: projectAnchor(stageRef.current, castlingAnchorRef.current),
  }));

  const syncProjectedAnchors = useEffectEvent(() => {
    const anchors = readProjectedAnchors();
    if (anchorProjectionFrameRef.current !== null) {
      window.cancelAnimationFrame(anchorProjectionFrameRef.current);
      anchorProjectionFrameRef.current = null;
    }

    publishProjectedAnchors(anchors);
  });

  const scheduleProjectedAnchors = useEffectEvent(() => {
    const anchors = readProjectedAnchors();
    if (areProjectedAnchorsEqual(queuedAnchorsRef.current, anchors)) {
      return;
    }

    queuedAnchorsRef.current = anchors;
    if (anchorProjectionFrameRef.current !== null) {
      return;
    }

    anchorProjectionFrameRef.current = window.requestAnimationFrame(() => {
      anchorProjectionFrameRef.current = null;
      publishProjectedAnchors(queuedAnchorsRef.current);
    });
  });

  useEffect(() => {
    promotionAnchorRef.current = { square: promotionAnchorSquare, yOffset: 1.15 };
    syncProjectedAnchors();
  }, [promotionAnchorSquare]);

  useEffect(() => {
    invalidMoveAnchorRef.current = { square: invalidMoveSquare, yOffset: 0.6 };
    syncProjectedAnchors();
  }, [invalidMoveSquare]);

  useEffect(() => {
    const square = checkSquare ?? null;
    checkAnchorRef.current = { square, yOffset: 0.9 };
    syncProjectedAnchors();
  }, [checkSquare]);

  useEffect(() => {
    const square = castlingTargets.length > 0 ? castlingTargets[0] : null;
    castlingAnchorRef.current = { square, yOffset: 0.7 };
    syncProjectedAnchors();
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

    // Sample anchor positions from the stage loop, but publish them back to React on the next frame.
    stage.setOnBeforeRender(scheduleProjectedAnchors);

    const visibilityHandler = () => {
      stage.setPaused(document.hidden);
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibilityHandler);
      if (anchorProjectionFrameRef.current !== null) {
        window.cancelAnimationFrame(anchorProjectionFrameRef.current);
        anchorProjectionFrameRef.current = null;
      }
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
