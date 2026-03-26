import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineClient } from "./EngineClient";

// Mock Worker
class MockWorker {
  onmessage: (event: any) => void = () => {};
  postMessage = vi.fn((command: string) => {
    if (command === "uci") {
      setTimeout(() => this.onmessage({ data: "id name Stockfish\nuciok" }), 0);
    } else if (command === "isready") {
      setTimeout(() => this.onmessage({ data: "readyok" }), 0);
    } else if (command.startsWith("go")) {
      // Simulate slow response
      setTimeout(() => this.onmessage({ data: "bestmove e2e4" }), 50);
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
    }

    (engineClient as any).initialized = false;
    (engineClient as any).activeSearch = null;
    (engineClient as any).currentAbortController = null;
    (engineClient as any).transitionQueue = Promise.resolve();
    await engineClient.init();
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
});
