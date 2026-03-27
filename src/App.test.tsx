import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const subscribers = new Set<(event: unknown) => void>();
let autoReportSceneReady = true;

const engineClientMock = {
  init: vi.fn().mockResolvedValue(undefined),
  newGame: vi.fn().mockResolvedValue(undefined),
  setPosition: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue({
    bestMove: "e7e5",
    pv: ["e7e5"],
    scoreCp: 12,
    mate: null,
    depth: 12,
  }),
  hint: vi.fn().mockResolvedValue({
    bestMove: "g1f3",
    pv: ["g1f3", "d7d5"],
    scoreCp: 24,
    mate: null,
    depth: 12,
  }),
  analyzeGame: vi.fn().mockResolvedValue({
    result: "active",
    centipawnLossBySide: { w: 22, b: 13 },
    tagsByPly: { 1: "good" },
    evaluationsByPly: {
      0: { scoreCp: 12, scoreMate: null },
      1: { scoreCp: 24, scoreMate: null },
      2: { scoreCp: 10, scoreMate: null },
    },
    criticalMoments: [
      {
        ply: 1,
        moveUci: "e2e4",
        san: "e4",
        tag: "good",
        swingCp: 12,
        bestLine: ["e2e4", "e7e5"],
        scoreCp: 24,
        scoreMate: null,
      },
    ],
  }),
  subscribe: vi.fn((listener: (event: unknown) => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }),
  stop: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
};

vi.mock("./engine/EngineClient", () => ({
  engineClient: engineClientMock,
}));

vi.mock("./components/ChessScene", () => ({
  ChessScene: ({
    onSquareSelect,
    onPromotionAnchorChange,
    onInvalidMoveAnchorChange,
    onLoadStateChange,
  }: {
    onSquareSelect: (square: "e2" | "e4" | "e5") => void;
    onPromotionAnchorChange?: (anchor: { x: number; y: number } | null) => void;
    onInvalidMoveAnchorChange?: (anchor: { x: number; y: number } | null) => void;
    onLoadStateChange?: (state: { phase: string; progress: number; messageKey: string }) => void;
  }) => (
    <div>
      <SceneBootReporter onLoadStateChange={onLoadStateChange} />
      <button onClick={() => onSquareSelect("e2")}>Square e2</button>
      <button onClick={() => onSquareSelect("e4")}>Square e4</button>
      <button onClick={() => onSquareSelect("e5")}>Square e5</button>
      <button onClick={() => onPromotionAnchorChange?.({ x: 160, y: 160 })}>Promotion anchor</button>
      <button onClick={() => onInvalidMoveAnchorChange?.({ x: 160, y: 160 })}>Invalid anchor</button>
      <button
        onClick={() =>
          onLoadStateChange?.({
            phase: "loading",
            progress: 68,
            messageKey: "scene.loading.materials",
          })
        }
      >
        Scene loading
      </button>
      <button
        onClick={() =>
          onLoadStateChange?.({
            phase: "ready",
            progress: 100,
            messageKey: "scene.loading.ready",
          })
        }
      >
        Scene ready
      </button>
    </div>
  ),
}));

function SceneBootReporter({
  onLoadStateChange,
}: {
  onLoadStateChange?: (state: { phase: string; progress: number; messageKey: string }) => void;
}) {
  useEffect(() => {
    if (!autoReportSceneReady) {
      return;
    }

    onLoadStateChange?.({
      phase: "ready",
      progress: 100,
      messageKey: "scene.loading.ready",
    });
  }, [onLoadStateChange]);

  return null;
}

describe("App integration", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    subscribers.clear();
    vi.resetModules();
    autoReportSceneReady = true;

    const { db } = await import("./persistence/db");
    db.close();
    await db.delete();
    await db.open();
  });

  it("boots and requests a hint on the player's turn", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByRole("button", { name: "Dica" }));

    await waitFor(() => {
      expect(engineClientMock.hint).toHaveBeenCalledTimes(1);
    });
  });

  it("persists theme, locale, and autosave state from the overlay shell", async () => {
    const { default: App } = await import("./App");
    const { loadBootstrapData } = await import("./persistence/db");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    await screen.findAllByText("Pronto para jogar");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Emerald" }));
    fireEvent.click(await screen.findByRole("button", { name: "English" }));
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    await waitFor(async () => {
      const bootstrapData = await loadBootstrapData();
      expect(bootstrapData.settings?.themeId).toBe("emerald");
      expect(bootstrapData.settings?.locale).toBe("en");
      expect(bootstrapData.autosave?.session.snapshot.moveList).toHaveLength(2);
      expect(bootstrapData.autosave?.session.snapshot.clockState.running).toBe(false);
    });
  });

  it("persists the quality override from the settings drawer", async () => {
    const { default: App } = await import("./App");
    const { loadBootstrapData } = await import("./persistence/db");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    await screen.findAllByText("Pronto para jogar");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Ultra" }));

    await waitFor(async () => {
      const bootstrapData = await loadBootstrapData();
      const settings = bootstrapData.settings as { qualityMode?: string; manualQualityTier?: number } | null;
      expect(settings?.qualityMode).toBe("manual");
      expect(settings?.manualQualityTier).toBe(3);
    });

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));

    await waitFor(async () => {
      const bootstrapData = await loadBootstrapData();
      const settings = bootstrapData.settings as { qualityMode?: string; manualQualityTier?: number } | null;
      expect(settings?.qualityMode).toBe("auto");
      expect(settings?.manualQualityTier).toBe(3);
    });
  });

  it("ignores a stale engine response after confirming a replacement game", async () => {
    let resolveSearch:
      | ((value: {
          bestMove: string;
          pv: string[];
          scoreCp: number;
          mate: null;
          depth: number;
        }) => void)
      | undefined;

    engineClientMock.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    const { default: App } = await import("./App");
    const { loadBootstrapData } = await import("./persistence/db");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Nova partida" }));
    fireEvent.click(await screen.findByRole("button", { name: "Começar agora" }));
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar nova" }));

    await waitFor(() => {
      expect(engineClientMock.newGame).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("e4")).not.toBeInTheDocument();
    });

    resolveSearch?.({
      bestMove: "e7e5",
      pv: ["e7e5"],
      scoreCp: 12,
      mate: null,
      depth: 12,
    });

    await waitFor(async () => {
      const bootstrapData = await loadBootstrapData();
      expect(bootstrapData.autosave?.session.snapshot.moveList).toHaveLength(0);
      expect(screen.queryByText("e4")).not.toBeInTheDocument();
    });
  });

  it("runs analysis from the menu drawer and renders the mocked summary", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Gerar análise" }));

    await waitFor(() => {
      expect(engineClientMock.analyzeGame).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Momentos críticos")).toBeInTheDocument();
    });
  });

  it("does not start overlapping analyses when the action is clicked repeatedly", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const analyzeButton = screen.getByRole("button", { name: "Gerar análise" });
    fireEvent.click(analyzeButton);
    fireEvent.click(analyzeButton);

    await waitFor(() => {
      expect(engineClientMock.analyzeGame).toHaveBeenCalledTimes(1);
    });
  });

  it("closes the history panel from its integrated toggle", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    const historyPanel = container.querySelector(".history-panel");
    expect(historyPanel).not.toBeNull();
    expect(historyPanel).not.toHaveClass("is-open");

    fireEvent.click(screen.getByRole("button", { name: "Abrir histórico" }));
    expect(historyPanel).toHaveClass("is-open");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => {
      expect(historyPanel).not.toHaveClass("is-open");
    });
  });

  it("keeps the boot scrim visible until the 3D scene reports ready and surfaces scene steps", async () => {
    autoReportSceneReady = false;

    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findAllByText("Pipo Chess 3D");
    await screen.findByText("Stockfish local pronto");

    expect(container.querySelector(".boot-scrim")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Scene loading" }));
    expect(await screen.findByText("Gerando materiais do tabuleiro")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Scene ready" }));

    await waitFor(() => {
      expect(container.querySelector(".boot-scrim")).toBeNull();
    });
  });

  it("keeps the history drawer mounted without using an overlay wrapper", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    const historyPanel = container.querySelector(".history-panel");
    expect(historyPanel).not.toBeNull();
    expect(historyPanel?.closest(".base-overlay")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Abrir histórico" }));
    expect(historyPanel).toHaveClass("is-open");
    expect(historyPanel?.closest(".base-overlay")).toBeNull();
  });

  it("makes the history shell non-interactive when opening the menu", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByRole("button", { name: "Abrir histórico" }));
    const historyPanel = container.querySelector(".history-panel");
    const historyShell = container.querySelector(".history-panel__shell");
    expect(historyPanel).toHaveClass("is-open");
    expect(historyShell).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    await waitFor(() => {
      expect(container.querySelector(".menu-drawer")).not.toBeNull();
    });

    expect(historyPanel).not.toHaveClass("is-open");
    expect((historyShell as HTMLElement).style.pointerEvents).toBe("none");
  });

  it("keeps camera presets accessible after entering analysis mode", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(await screen.findByRole("button", { name: "Analisar partida" }));

    const cameraButton = await screen.findByRole("button", { name: "Câmera" });
    fireEvent.click(cameraButton);

    expect(await screen.findByRole("button", { name: /Modo 2D/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Clássica/i })).toBeInTheDocument();
  }, 10000);

  it("removes the new game sheet from the DOM when it is closed", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");
    expect(container.querySelector(".new-game-sheet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Nova partida" }));
    expect(container.querySelector(".new-game-sheet")).not.toBeNull();

    fireEvent.click(container.querySelector(".overlay-scrim") as Element);

    await waitFor(() => {
      expect(container.querySelector(".new-game-sheet")).toBeNull();
    });
  });

  it("makes the exiting new game sheet non-interactive after clicking close", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByRole("button", { name: "Nova partida" }));

    const dialog = await screen.findByRole("dialog", { name: "Iniciar nova partida" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));

    const exitingSheet = container.querySelector(".new-game-sheet");
    if (exitingSheet) {
      expect((exitingSheet as HTMLElement).style.pointerEvents).toBe("none");
    }

    await waitFor(() => {
      expect(container.querySelector(".new-game-sheet")).toBeNull();
    });
  });

  it("keeps modal overlays blocking while their scrim is active", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByRole("button", { name: "Nova partida" }));

    const newGameOverlay = container.querySelector(".new-game-sheet")?.closest(".base-overlay");
    expect(newGameOverlay).not.toBeNull();
    expect((newGameOverlay as HTMLElement).style.pointerEvents).toBe("auto");
  });

  it("starts background analysis after importing a PGN file", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pgn = new File(["1. e4 e5 2. Nf3 Nc6"], "imported.pgn", {
      type: "application/x-chess-pgn",
    });

    fireEvent.change(fileInput, { target: { files: [pgn] } });

    await waitFor(() => {
      expect(engineClientMock.analyzeGame).toHaveBeenCalledTimes(1);
    });
  });

  it("renders the promotion popup when a pending promotion is anchored", async () => {
    const { default: App } = await import("./App");
    const { useGameStore } = await import("./state/gameStore");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    act(() => {
      useGameStore.setState({
        pendingPromotion: {
          from: "e7",
          to: "e8",
          anchorSquare: "e8",
        },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Promotion anchor" }));

    expect(await screen.findByRole("dialog", { name: "Escolha a promoção" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dama/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cavalo/i })).toBeInTheDocument();
  });

  it("flips the promotion popup below the anchor near the top edge", async () => {
    const { getPromotionPopupStyle } = await import("./App");
    const widthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
    const heightDescriptor = Object.getOwnPropertyDescriptor(window, "innerHeight");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    try {
      expect(getPromotionPopupStyle({ x: 640, y: 96 })).toMatchObject({
        left: "640px",
        top: "96px",
        transform: "translate(-50%, 0.75rem)",
      });
    } finally {
      if (widthDescriptor) {
        Object.defineProperty(window, "innerWidth", widthDescriptor);
      }
      if (heightDescriptor) {
        Object.defineProperty(window, "innerHeight", heightDescriptor);
      }
    }
  });

  it("shows invalid move feedback without clearing the selected piece", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByRole("button", { name: "Invalid anchor" }));
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e5"));

    expect(await screen.findByText("Lance ilegal")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps or closes the new game sheet according to the replace dialog action", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByText("Square e2"));
    fireEvent.click(screen.getByText("Square e4"));

    await waitFor(() => {
      expect(engineClientMock.search).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Nova partida" }));
    fireEvent.click(await screen.findByRole("button", { name: "Começar agora" }));

    expect(await screen.findByText("Substituir a partida atual?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continuar atual" }));

    await waitFor(() => {
      expect(screen.queryByText("Substituir a partida atual?")).not.toBeInTheDocument();
      expect(container.querySelector(".new-game-sheet")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Começar agora" }));
    expect(await screen.findByText("Substituir a partida atual?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByText("Substituir a partida atual?")).not.toBeInTheDocument();
      expect(container.querySelector(".new-game-sheet")).toBeNull();
    });
  }, 10000);

  it("opens the result modal for terminal sessions and can route to the menu drawer", async () => {
    const { default: App } = await import("./App");
    const { useGameStore } = await import("./state/gameStore");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    act(() => {
      useGameStore.setState((state) => ({
        session: {
          ...state.session,
          snapshot: {
            ...state.session.snapshot,
            status: "checkmate",
            sideToMove: state.session.playerColor,
            pgn: `${state.session.snapshot.pgn} #`,
          },
        },
      }));
    });

    await waitFor(() => {
      expect(container.querySelector(".result-modal")).not.toBeNull();
    });

    const resultModal = container.querySelector(".result-modal") as HTMLElement;
    expect(within(resultModal).getByText("Fim de partida")).toBeInTheDocument();

    fireEvent.click(within(resultModal).getByRole("button", { name: "Menu" }));

    await waitFor(() => {
      expect(container.querySelector(".result-modal")).toBeNull();
      expect(container.querySelector(".menu-drawer")).not.toBeNull();
    });
  });

  it("toggles zen mode from the action dock", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByRole("button", { name: "Zen" }));

    expect(await screen.findByRole("button", { name: "Sair do modo Zen" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sair do modo Zen" }));

    await waitFor(() => {
      const exitButton = screen.queryByRole("button", { name: "Sair do modo Zen" });
      if (!exitButton) {
        expect(exitButton).toBeNull();
        return;
      }

      expect(exitButton).not.toBeVisible();
    });
  });
});
