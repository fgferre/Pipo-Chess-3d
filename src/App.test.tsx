import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const subscribers = new Set<(event: unknown) => void>();

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
  }: {
    onSquareSelect: (square: "e2" | "e4") => void;
  }) => (
    <div>
      <button onClick={() => onSquareSelect("e2")}>Square e2</button>
      <button onClick={() => onSquareSelect("e4")}>Square e4</button>
    </div>
  ),
}));

describe("App integration", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    subscribers.clear();
    vi.resetModules();

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

  it("closes the history panel from its close button", async () => {
    const { default: App } = await import("./App");
    const { container } = render(<App />);

    await screen.findByText("Pipo Chess 3D");

    // Panel is conditionally rendered — not in DOM when closed
    expect(container.querySelector(".history-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Abrir histórico" }));

    const historyPanel = container.querySelector(".history-panel");
    expect(historyPanel).not.toBeNull();

    fireEvent.click(within(historyPanel as HTMLElement).getByRole("button", { name: "Fechar" }));
    await waitFor(() => {
      expect(container.querySelector(".history-panel")).toBeNull();
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Analisar partida" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Câmera" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Câmera" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Modo 2D/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Clássica/i })).toBeInTheDocument();
    });
  });

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
});
