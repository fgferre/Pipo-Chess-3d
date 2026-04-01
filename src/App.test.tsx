import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const subscribers = new Set<(event: unknown) => void>();
let autoReportSceneReady = true;
const pwaRegisterState = {
  needRefresh: false,
  offlineReady: false,
};
const updateServiceWorkerMock = vi.fn().mockResolvedValue(undefined);

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
    },
    criticalMoments: [],
  }),
  subscribe: vi.fn((listener: (event: unknown) => void) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }),
  stop: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
};

const soundServiceMock = {
  play: vi.fn(),
  applyPreferences: vi.fn(),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
  isEnabled: vi.fn().mockReturnValue(true),
  select: vi.fn(),
  blocked: vi.fn(),
  move: vi.fn(),
  capture: vi.fn(),
  promotion: vi.fn(),
  castle: vi.fn(),
  lowTime: vi.fn(),
  check: vi.fn(),
  checkmate: vi.fn(),
  gameOver: vi.fn(),
  undo: vi.fn(),
  invalidMove: vi.fn(),
};

const hapticsMock = {
  applyPreferences: vi.fn(),
  select: vi.fn(),
  blocked: vi.fn(),
  move: vi.fn(),
  capture: vi.fn(),
  promotion: vi.fn(),
  castle: vi.fn(),
  lowTime: vi.fn(),
  invalidMove: vi.fn(),
  light: vi.fn(),
  medium: vi.fn(),
  heavy: vi.fn(),
  check: vi.fn(),
  checkmate: vi.fn(),
  gameOver: vi.fn(),
  undo: vi.fn(),
};

vi.mock("./engine/EngineClient", () => ({
  engineClient: engineClientMock,
}));

vi.mock("./audio/soundService", () => ({
  soundService: soundServiceMock,
}));

vi.mock("./hooks/useHaptics", () => ({
  haptics: hapticsMock,
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [pwaRegisterState.needRefresh, vi.fn()],
    offlineReady: [pwaRegisterState.offlineReady, vi.fn()],
    updateServiceWorker: updateServiceWorkerMock,
  }),
}));

vi.mock("./components/ChessScene", () => ({
  ChessScene: ({
    checkSquare,
    onSquareSelect,
    onLoadStateChange,
  }: {
    checkSquare?: string | null;
    onSquareSelect: (square: "e2" | "e4" | "e7") => void;
    onLoadStateChange?: (state: { phase: string; progress: number; messageKey: string }) => void;
  }) => {
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

    useEffect(() => {
      void checkSquare;
    }, [checkSquare]);

    return (
      <div>
        <button onClick={() => onSquareSelect("e2")}>Square e2</button>
        <button onClick={() => onSquareSelect("e4")}>Square e4</button>
        <button onClick={() => onSquareSelect("e7")}>Square e7</button>
      </div>
    );
  },
}));

async function resetHarness() {
  cleanup();
  vi.clearAllMocks();
  subscribers.clear();
  vi.resetModules();
  autoReportSceneReady = true;
  pwaRegisterState.needRefresh = false;
  pwaRegisterState.offlineReady = false;
  updateServiceWorkerMock.mockReset().mockResolvedValue(undefined);

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  const { db } = await import("./persistence/db");
  db.close();
  await db.delete();
  await db.open();
}

describe("App feedback integration", () => {
  beforeEach(async () => {
    await resetHarness();
  });

  it("shows blocked feedback instead of selecting an opponent piece", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    await act(async () => {
      fireEvent.click(screen.getByText("Square e7"));
    });

    await waitFor(() => {
      expect(soundServiceMock.blocked).toHaveBeenCalledTimes(1);
      expect(hapticsMock.blocked).toHaveBeenCalledTimes(1);
    });

    expect(soundServiceMock.select).not.toHaveBeenCalled();
    expect(await screen.findByText("Peça bloqueada")).toBeInTheDocument();
  });

  it("blocks board input during the engine turn without replaying selection cues", async () => {
    engineClientMock.search.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Keep the engine turn pending for the second click.
        }),
    );

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    await act(async () => {
      fireEvent.click(screen.getByText("Square e2"));
      fireEvent.click(screen.getByText("Square e4"));
    });

    await waitFor(() => {
      expect(soundServiceMock.select).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Square e4"));
    });

    await waitFor(() => {
      expect(soundServiceMock.blocked).toHaveBeenCalledTimes(1);
      expect(hapticsMock.blocked).toHaveBeenCalledTimes(1);
    });

    expect(soundServiceMock.select).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Aguarde sua vez")).toBeInTheDocument();
  });

  it("reveals the engine detail in the expanded top bar", async () => {
    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    fireEvent.click(screen.getByTestId("shell-top-toggle"));

    const topBar = screen.getByTestId("shell-top-bar");
    expect(within(topBar).getByText("Stockfish local pronto")).toBeInTheDocument();
  });

  it("shows an explicit offline-ready pill once the service worker is ready", async () => {
    pwaRegisterState.offlineReady = true;

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    const topBar = screen.getByTestId("shell-top-bar");
    expect(within(topBar).getByText("Offline pronto")).toBeInTheDocument();
  });

  it("offers a reload action when a PWA update is waiting", async () => {
    pwaRegisterState.needRefresh = true;

    const { default: App } = await import("./App");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");

    const reloadButton = screen.getByRole("button", { name: "Atualizar app" });
    expect(screen.getByText("Atualização pronta")).toBeInTheDocument();

    fireEvent.click(reloadButton);

    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true);
  });

  it("persists sound and haptic preferences from the settings drawer", async () => {
    const { default: App } = await import("./App");
    const { loadBootstrapData } = await import("./persistence/db");
    render(<App />);

    await screen.findByText("Pipo Chess 3D");
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const soundControls = screen.getByText("Som").closest("label");
    const hapticControls = screen.getByText("Hápticos").closest("label");
    expect(soundControls).not.toBeNull();
    expect(hapticControls).not.toBeNull();

    fireEvent.click(within(soundControls as HTMLElement).getByRole("button", { name: "Desligado" }));
    fireEvent.click(within(hapticControls as HTMLElement).getByRole("button", { name: "Desligado" }));
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.35" },
    });

    await waitFor(async () => {
      const bootstrapData = await loadBootstrapData();
      expect(bootstrapData.settings?.soundEnabled).toBe(false);
      expect(bootstrapData.settings?.hapticsEnabled).toBe(false);
      expect(bootstrapData.settings?.soundVolume).toBeCloseTo(0.35, 2);
    });

    expect(soundServiceMock.applyPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        soundEnabled: false,
        hapticsEnabled: false,
        soundVolume: 0.35,
      }),
    );
    expect(hapticsMock.applyPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        soundEnabled: false,
        hapticsEnabled: false,
        soundVolume: 0.35,
      }),
    );
  });
});
