import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { themes } from "../data/themes";
import { createNewSession } from "../game/gameService";
import { useGameStore } from "../state/gameStore";
import { ChessScene } from "./ChessScene";

const stageInstances: Array<{
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
  createSceneAdapter: (container: HTMLDivElement, onSquareSelect: (square: string) => void) => {
    void container;
    void onSquareSelect;
    const adapter = {
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

describe("ChessScene", () => {
  beforeEach(() => {
    stageInstances.length = 0;
    useGameStore.setState({ cameraPreset: "classic" });
  });

  afterEach(() => {
    cleanup();
  });

  it("maps the store camera preset to the stage with minimal wiring", async () => {
    const session2d = createNewSession();
    useGameStore.setState({ cameraPreset: "2d" });
    const { rerender } = render(
      <ChessScene
        session={session2d}
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

    render(
      <ChessScene
        session={session}
        theme={themes[0]}
        interactionEnabled={false}
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
      expect(stageInstances[0]?.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ canInteract: false }),
      );
    });
  });

  it("propagates quality preference changes from manual back to auto", async () => {
    const baseSession = createNewSession();
    const { rerender } = render(
      <ChessScene
        session={{
          ...baseSession,
          settings: {
            ...baseSession.settings,
            qualityMode: "manual",
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

    render(
      <ChessScene
        session={session}
        theme={themes[0]}
        interactionEnabled={true}

        lastMove={null}
        promotionAnchorSquare={"e8"}
        selectedSquare={null}
        legalTargets={[]}
        castlingTargets={[]}
        hintMove={null}
        invalidMoveSquare={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={onPromotionAnchorChange}
        onInvalidMoveAnchorChange={vi.fn()}
        onCastlingAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.projectSquareToViewport).toHaveBeenCalledWith("e8", 1.15);
      expect(onPromotionAnchorChange).toHaveBeenCalledWith({ x: 120, y: 140 });
    });
  });
});
