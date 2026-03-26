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
    // Reset internal state for each test if possible, or just re-init
    // Since it's a singleton, we need to be careful.
    // Let's force a fresh init.
    (engineClient as any).initialized = false;
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
});
