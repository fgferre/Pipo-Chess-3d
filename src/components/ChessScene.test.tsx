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
  setAnimationMode: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../scene/ChessStage", () => ({
  ChessStage: class {
    init = vi.fn().mockResolvedValue(undefined);
    update = vi.fn();
    setPaused = vi.fn();
    setCameraPreset = vi.fn();
    setAnimationMode = vi.fn();
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
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenCalledWith("2d");
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
        selectedSquare={null}
        legalTargets={[]}
        hintMove={null}
        onSquareSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(stageInstances[0]?.setCameraPreset).toHaveBeenLastCalledWith("classic");
    });
  });
});
