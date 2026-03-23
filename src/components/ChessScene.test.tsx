import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Square } from "chess.js";
import { themes } from "../data/themes";
import { createNewSession } from "../game/gameService";
import { useGameStore } from "../state/gameStore";
import type { GameSession } from "../types/game";
import { ChessScene } from "./ChessScene";

const stageInstances: Array<{
  onSquareSelect: (square: Square) => void;
  init: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
  setCameraPreset: ReturnType<typeof vi.fn>;
  setCameraSensitivity: ReturnType<typeof vi.fn>;
  setAnimationMode: ReturnType<typeof vi.fn>;
  setQualityPreference: ReturnType<typeof vi.fn>;
  setShowCoordinates: ReturnType<typeof vi.fn>;
  projectSquareToViewport: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../scene/SceneAdapter", () => ({
  createSceneAdapter: (container: HTMLDivElement, onSquareSelect: (square: Square) => void) => {
    void container;
    const adapter = {
      onSquareSelect,
      init: vi.fn().mockResolvedValue(undefined),
      update: vi.fn(),
      setPaused: vi.fn(),
      setCameraPreset: vi.fn(),
      setCameraSensitivity: vi.fn(),
      setAnimationMode: vi.fn(),
      setQualityPreference: vi.fn(),
      setShowCoordinates: vi.fn(),
      projectSquareToViewport: vi.fn().mockReturnValue({ x: 120, y: 140 }),
      dispose: vi.fn(),
    };
    stageInstances.push(adapter);
    return adapter;
  },
}));

function renderScene({
  session = createNewSession(),
  theme = themes[0],
  interactionEnabled = true,
  lastMove = null,
  promotionAnchorSquare = null,
  selectedSquare = null,
  legalTargets = [],
  castlingTargets = [],
  hintMove = null,
  invalidMoveSquare = null,
  onSquareSelect = vi.fn(),
  onPromotionAnchorChange = vi.fn(),
  onInvalidMoveAnchorChange = vi.fn(),
  onCastlingAnchorChange = vi.fn(),
}: {
  session?: GameSession;
  theme?: (typeof themes)[number];
  interactionEnabled?: boolean;
  lastMove?: { from: Square; to: Square } | null;
  promotionAnchorSquare?: Square | null;
  selectedSquare?: Square | null;
  legalTargets?: Square[];
  castlingTargets?: Square[];
  hintMove?: { from: Square; to: Square } | null;
  invalidMoveSquare?: Square | null;
  onSquareSelect?: (square: Square) => void;
  onPromotionAnchorChange?: (anchor: { x: number; y: number } | null) => void;
  onInvalidMoveAnchorChange?: (anchor: { x: number; y: number } | null) => void;
  onCastlingAnchorChange?: (anchor: { x: number; y: number } | null) => void;
} = {}) {
  return render(
    <ChessScene
      session={session}
      theme={theme}
      interactionEnabled={interactionEnabled}
      lastMove={lastMove}
      promotionAnchorSquare={promotionAnchorSquare}
      selectedSquare={selectedSquare}
      legalTargets={legalTargets}
      castlingTargets={castlingTargets}
      hintMove={hintMove}
      invalidMoveSquare={invalidMoveSquare}
      onSquareSelect={onSquareSelect}
      onPromotionAnchorChange={onPromotionAnchorChange}
      onInvalidMoveAnchorChange={onInvalidMoveAnchorChange}
      onCastlingAnchorChange={onCastlingAnchorChange}
    />,
  );
}

describe("ChessScene", () => {
  beforeEach(() => {
    stageInstances.length = 0;
    useGameStore.setState({ cameraPreset: "classic" });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("maps the store camera preset to the stage with minimal wiring", async () => {
    const session2d = createNewSession();
    useGameStore.setState({ cameraPreset: "2d" });
    const { rerender } = renderScene({ session: session2d });

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenCalledWith("2d");
      expect(stageInstances[0]?.setCameraSensitivity).toHaveBeenCalledWith(session2d.settings.cameraSensitivity);
      expect(stageInstances[0]?.setQualityPreference).toHaveBeenCalledWith({
        qualityMode: session2d.settings.qualityMode,
        manualQualityTier: session2d.settings.manualQualityTier,
      });
    });

    const session3d = {
      ...session2d,
      settings: {
        ...session2d.settings,
        defaultViewMode: "3d" as const,
      },
    };
    useGameStore.setState({ cameraPreset: "classic" });

    rerender(
      <ChessScene
        session={session3d}
        theme={themes[0]}
        interactionEnabled={true}

        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        castlingTargets={[]}
        hintMove={null}
        invalidMoveSquare={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
        onInvalidMoveAnchorChange={vi.fn()}
        onCastlingAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenLastCalledWith("classic");
    });
  });

  it("forwards interactionEnabled as canInteract to the stage", async () => {
    const session = createNewSession();

    renderScene({ session, interactionEnabled: false });

    await waitFor(() => {
      expect(stageInstances[0]?.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ canInteract: false }),
      );
    });
  });

  it("propagates quality preference changes from manual back to auto", async () => {
    const baseSession = createNewSession();
    const { rerender } = renderScene({
      session: {
        ...baseSession,
        settings: {
          ...baseSession.settings,
          qualityMode: "manual",
          manualQualityTier: 3,
        },
      },
    });

    await waitFor(() => {
      expect(stageInstances[0]?.setQualityPreference).toHaveBeenLastCalledWith({
        qualityMode: "manual",
        manualQualityTier: 3,
      });
    });

    rerender(
      <ChessScene
        session={{
          ...baseSession,
          settings: {
            ...baseSession.settings,
            qualityMode: "auto",
            manualQualityTier: 3,
          },
        }}
        theme={themes[0]}
        interactionEnabled={true}
        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        castlingTargets={[]}
        hintMove={null}
        invalidMoveSquare={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
        onInvalidMoveAnchorChange={vi.fn()}
        onCastlingAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setQualityPreference).toHaveBeenLastCalledWith({
        qualityMode: "auto",
        manualQualityTier: 3,
      });
    });
  });

  it("projects a promotion anchor while a pending promotion is active", async () => {
    const session = createNewSession();
    const onPromotionAnchorChange = vi.fn();

    renderScene({ session, promotionAnchorSquare: "e8", onPromotionAnchorChange });

    await waitFor(() => {
      expect(stageInstances[0]?.projectSquareToViewport).toHaveBeenCalledWith("e8", 1.15);
      expect(onPromotionAnchorChange).toHaveBeenCalledWith({ x: 120, y: 140 });
    });
  });

  it("forwards the full board interaction payload to the stage", async () => {
    const session = createNewSession();
    const lastMove = { from: "e2" as const, to: "e4" as const };
    const hintMove = { from: "g1" as const, to: "f3" as const };

    renderScene({
      session,
      lastMove,
      selectedSquare: "e2",
      legalTargets: ["e3", "e4"],
      castlingTargets: ["g1"],
      hintMove,
    });

    await waitFor(() => {
      expect(stageInstances[0]?.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fen: session.snapshot.fen,
          orientation: session.settings.orientation,
          theme: themes[0],
          playerColor: session.playerColor,
          canInteract: true,
          lastMove,
          moveEntries: session.moveEntries,
          redoStack: session.redoStack,
          selectedSquare: "e2",
          legalTargets: ["e3", "e4"],
          castlingTargets: ["g1"],
          hintMove,
        }),
      );
    });
  });

  it("bridges stage square selection back to the React callback", async () => {
    const onSquareSelect = vi.fn();

    renderScene({ onSquareSelect });

    await waitFor(() => {
      expect(stageInstances).toHaveLength(1);
    });

    stageInstances[0].onSquareSelect("e4");
    expect(onSquareSelect).toHaveBeenCalledWith("e4");
  });

  it("projects invalid and castling anchors and clears them on teardown", async () => {
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const onInvalidMoveAnchorChange = vi.fn();
    const onCastlingAnchorChange = vi.fn();
    const { rerender, unmount } = renderScene({
      invalidMoveSquare: "e5",
      castlingTargets: ["g1", "c1"],
      onInvalidMoveAnchorChange,
      onCastlingAnchorChange,
    });

    await waitFor(() => {
      expect(stageInstances[0]?.projectSquareToViewport).toHaveBeenCalledWith("e5", 0.6);
      expect(stageInstances[0]?.projectSquareToViewport).toHaveBeenCalledWith("g1", 0.7);
      expect(onInvalidMoveAnchorChange).toHaveBeenCalledWith({ x: 120, y: 140 });
      expect(onCastlingAnchorChange).toHaveBeenCalledWith({ x: 120, y: 140 });
    });

    rerender(
      <ChessScene
        session={createNewSession()}
        theme={themes[0]}
        interactionEnabled={true}
        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        castlingTargets={[]}
        hintMove={null}
        invalidMoveSquare={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
        onInvalidMoveAnchorChange={onInvalidMoveAnchorChange}
        onCastlingAnchorChange={onCastlingAnchorChange}
      />,
    );

    await waitFor(() => {
      expect(onInvalidMoveAnchorChange).toHaveBeenLastCalledWith(null);
      expect(onCastlingAnchorChange).toHaveBeenLastCalledWith(null);
    });

    unmount();
    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });

  it("pauses the stage on visibility changes and disposes it on unmount", async () => {
    const setPausedCallsBeforeUnmount = () => stageInstances[0]?.setPaused.mock.calls.length ?? 0;
    const { unmount } = renderScene();

    await waitFor(() => {
      expect(stageInstances).toHaveLength(1);
      expect(stageInstances[0]?.init).toHaveBeenCalledTimes(1);
    });

    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });

    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(stageInstances[0]?.setPaused).toHaveBeenCalledWith(true);
    });

    const pausedCalls = setPausedCallsBeforeUnmount();
    unmount();

    expect(stageInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(stageInstances[0]?.setPaused).toHaveBeenCalledTimes(pausedCalls);

    if (hiddenDescriptor) {
      Object.defineProperty(document, "hidden", hiddenDescriptor);
    } else {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
    }
  });
});
