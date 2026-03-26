import { buildAnalysisSummary } from "../game/analysis";
import type {
  EngineAnalysisPayload,
  AnalysisSummary,
  DifficultyPreset,
  EngineEvaluation,
  EngineInfoSnapshot,
} from "../types/game";
import { engineAssetUrls } from "./assets";
import type { EngineResponse } from "./types";

type EventListener = (event: EngineResponse) => void;

export class EngineClient {
  private worker: Worker | null = null;
  private listeners = new Set<EventListener>();
  private initialized = false;
  private engineName = "Stockfish";
  private currentAbortController: AbortController | null = null;
  private isExpectingBestMove = false;
  private activeSearch:
    | {
        id: string;
        resolve: (evaluation: EngineEvaluation) => void;
        reject: (reason?: unknown) => void;
        info: EngineInfoSnapshot;
        settled: Promise<void>;
        settle: () => void;
      }
    | null = null;
  private readyResolver: (() => void) | null = null;
  private readyRejector: ((error: Error) => void) | null = null;
  private analysisToken = 0;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.emitStatus("loading", "init", "Loading Stockfish");
    this.worker?.terminate();
    const scriptUrl = new URL(engineAssetUrls.scriptUrl, window.location.href);
    const wasmUrl = new URL(engineAssetUrls.wasmUrl, window.location.href);
    this.worker = new Worker(`${scriptUrl.toString()}#${encodeURIComponent(wasmUrl.toString())}`);
    this.worker.onmessage = (event: MessageEvent<string>) => {
      this.handleWorkerMessage(event.data);
    };
    this.worker.onerror = () => {
      const error = new Error("Engine boot failed");
      this.readyRejector?.(error);
      this.rejectActiveSearch(error);
      this.emitStatus("error", "init", "Engine boot failed");
    };

    await new Promise<void>((resolve, reject) => {
      this.readyResolver = resolve;
      this.readyRejector = reject;
      this.send("uci");
    });

    this.initialized = true;
  }

  async newGame(): Promise<void> {
    this.send("ucinewgame");
    this.send("isready");
  }

  async setPosition(fen: string): Promise<void> {
    this.send(`position fen ${fen}`);
  }

  async search(fen: string, difficulty: DifficultyPreset) {
    this.currentAbortController?.abort();
    this.currentAbortController = new AbortController();
    const id = `search-${Date.now()}`;

    this.configureDifficulty(difficulty);
    this.emitStatus("thinking", "search", "Thinking");
    const result = await this.evaluatePosition(fen, difficulty.moveTimeMs, id, this.currentAbortController.signal);
    this.emitStatus("ready", "search", "Ready");
    return result;
  }

  async hint(fen: string, difficulty: DifficultyPreset) {
    this.currentAbortController?.abort();
    this.currentAbortController = new AbortController();
    const id = `hint-${Date.now()}`;

    this.configureDifficulty(difficulty);
    this.emitStatus("thinking", "hint", "Thinking");
    const result = await this.evaluatePosition(fen, difficulty.hintTimeMs, id, this.currentAbortController.signal);
    this.emitStatus("ready", "hint", "Ready");
    return result;
  }

  async analyzeGame(payload: EngineAnalysisPayload, moveTimeMs = 180): Promise<AnalysisSummary> {
    this.currentAbortController?.abort();
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const token = ++this.analysisToken;
    this.send("setoption name UCI_LimitStrength value false");
    this.send("setoption name Skill Level value 20");
    this.emitStatus("analyzing", "analysis", "Analyzing");

    const evaluations: Array<{
      item: EngineAnalysisPayload["workItems"][number];
      before: EngineEvaluation;
      after: EngineEvaluation;
    }> = [];

    for (const [index, item] of payload.workItems.entries()) {
      if (token !== this.analysisToken || signal.aborted) {
        throw new Error("Analysis interrupted");
      }

      const beforeId = `analysis-${item.ply}-before`;
      const afterId = `analysis-${item.ply}-after`;

      const before = await this.evaluatePosition(item.fenBefore, moveTimeMs, beforeId, signal);
      const after = await this.evaluatePosition(item.fenAfter, moveTimeMs, afterId, signal);
      evaluations.push({ item, before, after });
      this.listeners.forEach((listener) =>
        listener({
          type: "analysisProgress",
          requestId: "analysis",
          completed: index + 1,
          total: payload.workItems.length,
          currentPly: item.ply,
        }),
      );
    }

    const summary = buildAnalysisSummary(payload, evaluations);
    this.emitStatus("ready", "analysis", "Ready");
    return summary;
  }

  async stop(): Promise<void> {
    this.analysisToken += 1;
    this.currentAbortController?.abort();
    this.isExpectingBestMove = false;
    const activeSearch = this.activeSearch;
    this.send("stop");

    if (!activeSearch) {
      this.emitStatus("ready", "stop", "Ready");
      return;
    }

    await activeSearch.settled;
    this.emitStatus("ready", "stop", "Ready");
  }

  terminate(): void {
    this.isExpectingBestMove = false;
    this.currentAbortController?.abort();
    this.worker?.terminate();
  }

  private async evaluatePosition(
    fen: string,
    moveTimeMs: number,
    id: string,
    signal: AbortSignal,
  ): Promise<EngineEvaluation> {
    this.send(`position fen ${fen}`);

    return new Promise<EngineEvaluation>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Analysis interrupted"));
        return;
      }

      const onAbort = () => {
        this.isExpectingBestMove = false;
        this.send("stop");
        reject(new Error("Analysis interrupted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      let settleSearch: () => void = () => undefined;
      const settled = new Promise<void>((settle) => {
        settleSearch = settle;
      });

      this.isExpectingBestMove = true;
      this.activeSearch = {
        id,
        resolve: (val) => {
          signal.removeEventListener("abort", onAbort);
          resolve(val);
        },
        reject: (err) => {
          signal.removeEventListener("abort", onAbort);
          reject(err);
        },
        info: {
          bestMove: null,
          pv: [],
          scoreCp: null,
          mate: null,
          depth: null,
        },
        settled,
        settle: settleSearch,
      };

      this.send(`go movetime ${moveTimeMs}`);
    });
  }

  private handleWorkerMessage(payload: string): void {
    const lines = String(payload)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      this.processLine(line);
    }
  }

  private processLine(line: string): void {
    if (line.startsWith("id name")) {
      this.engineName = line.replace("id name", "").trim();
      return;
    }

    if (line === "uciok") {
      this.send("setoption name Hash value 16");
      this.send("setoption name UCI_ShowWDL value false");
      this.send("isready");
      return;
    }

    if (line === "readyok") {
      this.readyResolver?.();
      this.readyResolver = null;
      this.readyRejector = null;
      this.emitReady();
      return;
    }

    if (!this.activeSearch) {
      return;
    }

    if (line.startsWith("info")) {
      this.activeSearch.info = this.parseInfoLine(line, this.activeSearch.info);
      return;
    }

    if (line.startsWith("bestmove")) {
      if (!this.isExpectingBestMove) {
        this.activeSearch.settle();
        return;
      }

      this.isExpectingBestMove = false;
      const bestMove = line.split(" ")[1];
      const activeSearch = this.activeSearch;
      activeSearch.resolve({
        bestMove,
        pv: activeSearch.info.pv,
        scoreCp: activeSearch.info.scoreCp,
        mate: activeSearch.info.mate,
        depth: activeSearch.info.depth,
      });
      activeSearch.settle();
      this.activeSearch = null;
    }
  }

  private parseInfoLine(line: string, previous: EngineInfoSnapshot): EngineInfoSnapshot {
    const depth = this.matchNumber(line, / depth (\d+)/);
    const scoreCp = this.matchNumber(line, / score cp (-?\d+)/);
    const mate = this.matchNumber(line, / score mate (-?\d+)/);
    const pvMatch = line.match(/ pv (.+)$/);

    return {
      bestMove: previous.bestMove,
      pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : previous.pv,
      scoreCp: scoreCp ?? previous.scoreCp,
      mate: mate ?? previous.mate,
      depth: depth ?? previous.depth,
    };
  }

  private configureDifficulty(difficulty: DifficultyPreset): void {
    if (difficulty.uciElo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${difficulty.uciElo}`);
    } else {
      this.send("setoption name UCI_LimitStrength value false");
    }

    this.send(`setoption name Skill Level value ${difficulty.skillLevelFallback}`);
  }

  private emitReady(): void {
    this.listeners.forEach((listener) =>
      listener({
        type: "ready",
        requestId: "init",
        engineName: this.engineName,
      }),
    );
    this.emitStatus("ready", "init", "Ready");
  }

  private emitStatus(
    phase: "loading" | "ready" | "thinking" | "analyzing" | "error",
    requestId: string,
    message: string,
  ): void {
    this.listeners.forEach((listener) =>
      listener({
        type: "status",
        phase,
        requestId,
        message,
      }),
    );
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private rejectActiveSearch(error: Error): void {
    if (!this.activeSearch) {
      return;
    }

    const activeSearch = this.activeSearch;
    this.activeSearch = null;
    activeSearch.reject(error);
    activeSearch.settle();
  }

  private matchNumber(line: string, pattern: RegExp): number | null {
    const match = line.match(pattern);
    return match ? Number(match[1]) : null;
  }
}

export const engineClient = new EngineClient();
