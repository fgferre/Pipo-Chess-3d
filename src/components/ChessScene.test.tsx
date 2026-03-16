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
  setViewportPadding: ReturnType<typeof vi.fn>;
  setAnimationMode: ReturnType<typeof vi.fn>;
  projectSquareToViewport: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../scene/ChessStage", () => ({
  ChessStage: class {
    init = vi.fn().mockResolvedValue(undefined);
    update = vi.fn();
    setPaused = vi.fn();
    setCameraPreset = vi.fn();
    setCameraSensitivity = vi.fn();
    setViewportPadding = vi.fn();
    setAnimationMode = vi.fn();
    projectSquareToViewport = vi.fn().mockReturnValue({ x: 120, y: 140 });
    dispose = vi.fn();

    constructor(container: HTMLDivElement, onSquareSelect: (square: string) => void) {
      void container;
      void onSquareSelect;
      stageInstances.push(this);
    }
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
        viewportPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenCalledWith("2d");
      expect(stageInstances[0]?.setCameraSensitivity).toHaveBeenCalledWith(session2d.settings.cameraSensitivity);
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
        viewportPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenLastCalledWith("classic");
    });
  });

  it("forwards viewport padding while disabling piece interaction", async () => {
    const session = createNewSession();
    const viewportPadding = { top: 48, right: 180, bottom: 92, left: 36 };

    render(
      <ChessScene
        session={session}
        theme={themes[0]}
        interactionEnabled={false}
        viewportPadding={viewportPadding}
        lastMove={null}
        promotionAnchorSquare={null}
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ canInteract: false }),
      );
      expect(stageInstances[0]?.setViewportPadding).toHaveBeenCalledWith(viewportPadding);
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
        viewportPadding={{ top: 0, right: 0, bottom: 0, left: 0 }}
        lastMove={null}
        promotionAnchorSquare={"e8"}
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
        onPromotionAnchorChange={onPromotionAnchorChange}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.projectSquareToViewport).toHaveBeenCalledWith("e8", 1.15);
      expect(onPromotionAnchorChange).toHaveBeenCalledWith({ x: 120, y: 140 });
    });
  });
});
