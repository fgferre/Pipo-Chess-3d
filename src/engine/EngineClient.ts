import { buildAnalysisSummary } from "../game/analysis";
import { clampSupportedUciElo } from "../data/difficulties";
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
  private initPromise: Promise<void> | null = null;
  private workerDead = false;
  private engineName = "Stockfish";
  private currentAbortController: AbortController | null = null;
  private transitionQueue = Promise.resolve();
  private activeSearch:
    | {
        id: string;
        ignoreBestMove: boolean;
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
  private static readonly SEARCH_TIMEOUT_MS = 30_000;
  private static readonly ANALYSIS_STEP_TIMEOUT_MS = 60_000;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async init(): Promise<void> {
    if (this.initialized && !this.workerDead && this.worker) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.emitStatus("loading", "init", "Loading Stockfish");
    const initPromise = (async () => {
      this.disposeWorker();
      this.workerDead = false;
      this.initialized = false;

      try {
        const scriptUrl = new URL(engineAssetUrls.scriptUrl, window.location.href);
        const wasmUrl = new URL(engineAssetUrls.wasmUrl, window.location.href);
        const worker = new Worker(`${scriptUrl.toString()}#${encodeURIComponent(wasmUrl.toString())}`);
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<string>) => {
          this.handleWorkerMessage(event.data);
        };
        worker.onerror = () => {
          this.failEngine(
            new Error(this.initialized ? "Engine worker crashed" : "Engine boot failed"),
            this.initialized ? "runtime" : "init",
          );
        };
      } catch (error) {
        const bootError = error instanceof Error ? error : new Error("Engine boot failed");
        this.failEngine(bootError, "init");
        throw bootError;
      }

      await new Promise<void>((resolve, reject) => {
        this.readyResolver = resolve;
        this.readyRejector = reject;
        this.send("uci");
      });

      this.initialized = true;
    })();

    this.initPromise = initPromise;

    try {
      await initPromise;
    } finally {
      if (this.initPromise === initPromise) {
        this.initPromise = null;
      }
    }
  }

  async newGame(): Promise<void> {
    await this.init();
    this.send("ucinewgame");
    this.send("isready");
  }

  async setPosition(fen: string): Promise<void> {
    await this.init();
    this.send(`position fen ${fen}`);
  }

  async search(fen: string, difficulty: DifficultyPreset) {
    await this.init();
    let pendingSearch: Promise<EngineEvaluation> | null = null;

    await this.withTransitionLock(async () => {
      await this.abortActiveSearch();
      this.currentAbortController = new AbortController();
      const id = `search-${Date.now()}`;

      this.configureDifficulty(difficulty);
      this.emitStatus("thinking", "search", "Thinking");
      pendingSearch = this.evaluatePosition(
        fen, difficulty.moveTimeMs, id, this.currentAbortController.signal,
        EngineClient.SEARCH_TIMEOUT_MS,
      );
    });

    const result = await pendingSearch!;
    this.emitStatus("ready", "search", "Ready");
    return result;
  }

  async hint(fen: string, difficulty: DifficultyPreset) {
    await this.init();
    let pendingSearch: Promise<EngineEvaluation> | null = null;

    await this.withTransitionLock(async () => {
      await this.abortActiveSearch();
      this.currentAbortController = new AbortController();
      const id = `hint-${Date.now()}`;

      this.configureDifficulty(difficulty);
      this.emitStatus("thinking", "hint", "Thinking");
      pendingSearch = this.evaluatePosition(
        fen, difficulty.hintTimeMs, id, this.currentAbortController.signal,
        EngineClient.SEARCH_TIMEOUT_MS,
      );
    });

    const result = await pendingSearch!;
    this.emitStatus("ready", "hint", "Ready");
    return result;
  }

  async analyzeGame(payload: EngineAnalysisPayload, moveTimeMs = 180): Promise<AnalysisSummary> {
    await this.init();
    await this.withTransitionLock(async () => {
      await this.abortActiveSearch();
      this.currentAbortController = new AbortController();
    });
    const controller = this.currentAbortController;
    if (!controller) {
      throw new Error("Engine controller missing");
    }

    const signal = controller.signal;

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

      const before = await this.evaluatePosition(
        item.fenBefore, moveTimeMs, beforeId, signal,
        EngineClient.ANALYSIS_STEP_TIMEOUT_MS,
      );
      const after = await this.evaluatePosition(
        item.fenAfter, moveTimeMs, afterId, signal,
        EngineClient.ANALYSIS_STEP_TIMEOUT_MS,
      );
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
    await this.withTransitionLock(async () => {
      await this.abortActiveSearch();
    });

    if (this.workerDead || !this.worker || !this.initialized) {
      return;
    }

    this.emitStatus("ready", "stop", "Ready");
  }

  terminate(): void {
    const error = new Error("Engine terminated");
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.rejectActiveSearch(error);
    this.readyRejector?.(error);
    this.readyResolver = null;
    this.readyRejector = null;
    this.initPromise = null;
    this.disposeWorker();
    this.workerDead = true;
    this.initialized = false;
  }

  private async evaluatePosition(
    fen: string,
    moveTimeMs: number,
    id: string,
    signal: AbortSignal,
    timeoutMs?: number,
  ): Promise<EngineEvaluation> {
    this.send(`position fen ${fen}`);

    return new Promise<EngineEvaluation>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("Analysis interrupted"));
        return;
      }

      let settleSearch: () => void = () => undefined;
      const settled = new Promise<void>((settle) => {
        settleSearch = settle;
      });

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        signal.removeEventListener("abort", onAbort);
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const searchState = {
        id,
        ignoreBestMove: false,
        resolve: (val: EngineEvaluation) => {
          cleanup();
          if (this.currentAbortController?.signal === signal) {
            this.currentAbortController = null;
          }
          resolve(val);
        },
        reject: (err: unknown) => {
          cleanup();
          if (this.currentAbortController?.signal === signal) {
            this.currentAbortController = null;
          }
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

      const onAbort = () => {
        searchState.ignoreBestMove = true;
        this.send("stop");
        searchState.reject(new Error("Analysis interrupted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });

      if (timeoutMs !== undefined) {
        timeoutHandle = setTimeout(() => {
          searchState.ignoreBestMove = true;
          this.failEngine(new Error("Engine response timed out"), id);
        }, moveTimeMs + timeoutMs);
      }

      this.activeSearch = searchState;

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
      if (this.activeSearch.ignoreBestMove) {
        return;
      }

      this.activeSearch.info = this.parseInfoLine(line, this.activeSearch.info);
      return;
    }

    if (line.startsWith("bestmove")) {
      const activeSearch = this.activeSearch;
      if (activeSearch.ignoreBestMove) {
        activeSearch.settle();
        this.activeSearch = null;
        return;
      }

      const bestMove = line.split(" ")[1];
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
    if (difficulty.uciElo !== null) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${clampSupportedUciElo(difficulty.uciElo)}`);
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

  private disposeWorker(): void {
    if (!this.worker) {
      return;
    }

    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }

  private async withTransitionLock<T>(callback: () => Promise<T>): Promise<T> {
    const previousTransition = this.transitionQueue;
    let releaseTransition: () => void = () => {};
    this.transitionQueue = new Promise<void>((resolve) => {
      releaseTransition = resolve;
    });

    await previousTransition;

    try {
      return await callback();
    } finally {
      releaseTransition();
    }
  }

  private async abortActiveSearch(): Promise<void> {
    const activeSearch = this.activeSearch;
    const controller = this.currentAbortController;

    if (!activeSearch && !controller) {
      return;
    }

    controller?.abort();
    this.currentAbortController = null;

    if (!activeSearch) {
      return;
    }

    await activeSearch.settled;
  }

  private rejectActiveSearch(error: Error): void {
    if (!this.activeSearch) {
      return;
    }

    const activeSearch = this.activeSearch;
    this.currentAbortController = null;
    this.activeSearch = null;
    activeSearch.reject(error);
    activeSearch.settle();
  }

  private failEngine(error: Error, requestId: string): void {
    this.workerDead = true;
    this.initialized = false;
    const rejectReady = this.readyRejector;
    this.readyResolver = null;
    this.readyRejector = null;
    this.disposeWorker();
    rejectReady?.(error);
    this.rejectActiveSearch(error);
    this.emitStatus("error", requestId, error.message);
  }

  private matchNumber(line: string, pattern: RegExp): number | null {
    const match = line.match(pattern);
    return match ? Number(match[1]) : null;
  }
}

export const engineClient = new EngineClient();
