import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineClient } from "./EngineClient";

// Mock Worker
class MockWorker {
  static failNextInit = false;
  static instances: MockWorker[] = [];

  onmessage: ((event: any) => void) | null = () => {};
  onerror: ((event: unknown) => void) | null = () => {};

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage = vi.fn((command: string) => {
    if (command === "uci") {
      if (MockWorker.failNextInit) {
        MockWorker.failNextInit = false;
        setTimeout(() => {
          if (typeof this.onerror === "function") {
            this.onerror(new ErrorEvent("error"));
          }
        }, 0);
        return;
      }

      setTimeout(() => {
        if (typeof this.onmessage === "function") {
          this.onmessage({ data: "id name Stockfish\nuciok" });
        }
      }, 0);
    } else if (command === "isready") {
      setTimeout(() => {
        if (typeof this.onmessage === "function") {
          this.onmessage({ data: "readyok" });
        }
      }, 0);
    } else if (command.startsWith("go")) {
      // Simulate slow response
      setTimeout(() => {
        if (typeof this.onmessage === "function") {
          this.onmessage({ data: "bestmove e2e4" });
        }
      }, 50);
    }
  });
  terminate = vi.fn();
}

vi.stubGlobal("Worker", MockWorker);

describe("EngineClient", () => {
  beforeEach(async () => {
    const previousWorker = (engineClient as any).worker as MockWorker | null;
    if (previousWorker) {
      previousWorker.onmessage = () => {};
      previousWorker.onerror = () => {};
    }

    (engineClient as any).initialized = false;
    (engineClient as any).initPromise = null;
    (engineClient as any).workerDead = false;
    (engineClient as any).activeSearch = null;
    (engineClient as any).currentAbortController = null;
    (engineClient as any).readyResolver = null;
    (engineClient as any).readyRejector = null;
    (engineClient as any).transitionQueue = Promise.resolve();
    MockWorker.failNextInit = false;
    MockWorker.instances = [];
    await engineClient.init();
  });

  it("reuses the same init promise while the worker is still booting", async () => {
    engineClient.terminate();
    MockWorker.instances = [];

    const init1 = engineClient.init();
    const init2 = engineClient.init();

    await Promise.all([init1, init2]);

    expect(MockWorker.instances).toHaveLength(1);
  });

  it("cancels previous search when a new one starts", async () => {
    const difficulty = { moveTimeMs: 100, skillLevelFallback: 20 } as any;
    
    const promise1 = engineClient.search("startpos", difficulty);
    const promise2 = engineClient.search("startpos", difficulty);

    await expect(promise1).rejects.toThrow("Analysis interrupted");
    const result2 = await promise2;
    expect(result2.bestMove).toBe("e2e4");
  });

  it("sends 'stop' command to worker on abort", async () => {
    const difficulty = { moveTimeMs: 100, skillLevelFallback: 20 } as any;
    const worker = (engineClient as any).worker;
    
    const promise1 = engineClient.search("startpos", difficulty);
    engineClient.search("startpos", difficulty); // triggers abort

    await expect(promise1).rejects.toThrow("Analysis interrupted");
    expect(worker.postMessage).toHaveBeenCalledWith("stop");
  });

  it("ignores the stale bestmove emitted for a stopped search", async () => {
    const difficulty = { moveTimeMs: 100, skillLevelFallback: 20 } as any;
    const worker = (engineClient as any).worker as MockWorker;
    let goCount = 0;

    worker.postMessage.mockImplementation((command: string) => {
      if (command === "uci") {
        setTimeout(() => worker.onmessage({ data: "id name Stockfish\nuciok" }), 0);
        return;
      }

      if (command === "isready") {
        setTimeout(() => worker.onmessage({ data: "readyok" }), 0);
        return;
      }

      if (command === "stop") {
        setTimeout(() => worker.onmessage({ data: "bestmove a2a3" }), 5);
        return;
      }

      if (command.startsWith("go")) {
        goCount += 1;
        if (goCount === 2) {
          setTimeout(() => worker.onmessage({ data: "bestmove h2h4" }), 5);
        }
      }
    });

    const promise1 = engineClient.search("startpos", difficulty);
    const promise2 = engineClient.search("startpos", difficulty);

    await expect(promise1).rejects.toThrow("Analysis interrupted");
    await expect(promise2).resolves.toMatchObject({ bestMove: "h2h4" });
  });

  it("clamps unsupported UCI_Elo values before sending them to the worker", async () => {
    const difficulty = {
      moveTimeMs: 100,
      skillLevelFallback: 4,
      uciElo: 800,
    } as any;
    const worker = (engineClient as any).worker as MockWorker;

    await engineClient.search("startpos", difficulty);

    expect(worker.postMessage).toHaveBeenCalledWith("setoption name UCI_LimitStrength value true");
    expect(worker.postMessage).toHaveBeenCalledWith("setoption name UCI_Elo value 1320");
    expect(worker.postMessage).toHaveBeenCalledWith("setoption name Skill Level value 4");
  });

  it("re-initializes on the next search after worker death", async () => {
    (engineClient as any).workerDead = true;
    (engineClient as any).initialized = false;
    (engineClient as any).worker = null;

    const difficulty = { moveTimeMs: 100, skillLevelFallback: 20 } as any;

    await expect(engineClient.search("startpos", difficulty)).resolves.toMatchObject({ bestMove: "e2e4" });
  });

  it("allows re-init after worker death", async () => {
    (engineClient as any).workerDead = true;
    (engineClient as any).initialized = false;

    await engineClient.init();

    expect((engineClient as any).initialized).toBe(true);
    expect((engineClient as any).workerDead).toBe(false);
  });

  it("rejects with timeout when the worker stops responding", async () => {
    const difficulty = { moveTimeMs: 10, skillLevelFallback: 20 } as any;
    const worker = (engineClient as any).worker as MockWorker;

    worker.postMessage.mockImplementation((command: string) => {
      if (command === "uci") {
        setTimeout(() => worker.onmessage({ data: "id name Stockfish\nuciok" }), 0);
        return;
      }
      if (command === "isready") {
        setTimeout(() => worker.onmessage({ data: "readyok" }), 0);
        return;
      }
      // Never respond to "go" — simulate a hung worker.
    });

    // Override the timeout to something short for the test.
    const originalTimeout = (engineClient.constructor as any).SEARCH_TIMEOUT_MS;
    (engineClient.constructor as any).SEARCH_TIMEOUT_MS = 50;

    try {
      await expect(engineClient.search("startpos", difficulty)).rejects.toThrow(
        "Engine response timed out",
      );
      expect((engineClient as any).workerDead).toBe(true);
    } finally {
      (engineClient.constructor as any).SEARCH_TIMEOUT_MS = originalTimeout;
    }
  });

  it("does not emit a ready status when stop runs after the worker died", async () => {
    const listener = vi.fn();
    const unsubscribe = engineClient.subscribe(listener);

    (engineClient as any).workerDead = true;
    (engineClient as any).initialized = false;
    (engineClient as any).worker = null;

    await engineClient.stop();

    unsubscribe();
    expect(listener).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "status", phase: "ready", requestId: "stop" }),
    );
  });
});
