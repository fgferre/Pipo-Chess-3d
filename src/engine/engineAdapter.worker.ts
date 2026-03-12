/// <reference lib="webworker" />

import { buildAnalysisSummary } from "../game/analysis";
import type { EngineEvaluation, EngineInfoSnapshot } from "../types/game";
import type {
  AnalyzeRequest,
  EngineResponse,
  HintRequest,
  InitEngineRequest,
  SearchRequest,
} from "./types";

const workerScope = self as DedicatedWorkerGlobalScope;

let engineWorker: Worker | null = null;
let engineName = "Stockfish";
let currentFen = new URLSearchParams().toString() ? "startpos" : "startpos";
let initRequestId = "";
let readyResolver: (() => void) | null = null;
let readyRejector: ((error: Error) => void) | null = null;
let activeSearch:
  | {
      resolve: (evaluation: EngineEvaluation) => void;
      reject: (reason?: unknown) => void;
      info: EngineInfoSnapshot;
    }
  | null = null;
let analysisToken = 0;

workerScope.onmessage = async (event) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "init":
        await initEngine(request);
        break;
      case "newGame":
        sendToEngine("ucinewgame");
        sendToEngine("isready");
        postResponse({ type: "positionAck", requestId: request.requestId });
        break;
      case "setPosition":
        currentFen = request.fen;
        sendPosition(currentFen);
        postResponse({ type: "positionAck", requestId: request.requestId });
        break;
      case "search":
        await handleSearch(request, "searchResult");
        break;
      case "hint":
        await handleSearch(request, "hintResult");
        break;
      case "analyze":
        await handleAnalysis(request);
        break;
      case "stop":
        analysisToken += 1;
        sendToEngine("stop");
        postResponse({ type: "positionAck", requestId: request.requestId });
        break;
    }
  } catch (error) {
    postResponse({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Unknown engine error",
    });
  }
};

async function initEngine(request: InitEngineRequest): Promise<void> {
  initRequestId = request.requestId;
  emitStatus("loading", request.requestId, "Loading Stockfish");

  engineWorker?.terminate();
  engineWorker = new Worker(`${request.scriptUrl}#${encodeURIComponent(request.wasmUrl)}`);
  engineWorker.onmessage = handleEngineMessage;
  engineWorker.onerror = () => {
    emitStatus("error", request.requestId, "Engine boot failed");
    readyRejector?.(new Error("Engine boot failed"));
  };

  await new Promise<void>((resolve, reject) => {
    readyResolver = resolve;
    readyRejector = reject;
    sendToEngine("uci");
  });

  postResponse({
    type: "ready",
    requestId: request.requestId,
    engineName,
  });
}

async function handleSearch(
  request: SearchRequest | HintRequest,
  responseType: "searchResult" | "hintResult",
): Promise<void> {
  currentFen = request.fen ?? currentFen;
  configureDifficulty(request.difficulty);
  emitStatus("thinking", request.requestId, "Thinking");

  const result = await evaluatePosition(
    currentFen,
    request.type === "search" ? request.moveTimeMs ?? request.difficulty.moveTimeMs : request.difficulty.hintTimeMs,
  );

  postResponse({
    type: responseType,
    requestId: request.requestId,
    bestMove: result.bestMove,
    pv: result.pv,
    scoreCp: result.scoreCp,
    mate: result.mate,
    depth: result.depth,
  });
  emitStatus("ready", request.requestId, "Ready");
}

async function handleAnalysis(request: AnalyzeRequest): Promise<void> {
  const token = ++analysisToken;
  emitStatus("analyzing", request.requestId, "Analyzing");
  sendToEngine("setoption name UCI_LimitStrength value false");
  sendToEngine("setoption name Skill Level value 20");

  const evaluations: Array<{
    item: AnalyzeRequest["payload"]["workItems"][number];
    before: EngineEvaluation;
    after: EngineEvaluation;
  }> = [];

  for (const [index, item] of request.payload.workItems.entries()) {
    if (token !== analysisToken) {
      throw new Error("Analysis interrupted");
    }

    const before = await evaluatePosition(item.fenBefore, request.moveTimeMs);
    const after = await evaluatePosition(item.fenAfter, request.moveTimeMs);

    evaluations.push({ item, before, after });
    postResponse({
      type: "analysisProgress",
      requestId: request.requestId,
      completed: index + 1,
      total: request.payload.workItems.length,
      currentPly: item.ply,
    });
  }

  postResponse({
    type: "analysisResult",
    requestId: request.requestId,
    summary: buildAnalysisSummary(request.payload, evaluations),
  });
  emitStatus("ready", request.requestId, "Ready");
}

async function evaluatePosition(fen: string, moveTimeMs: number): Promise<EngineEvaluation> {
  sendPosition(fen);

  return new Promise<EngineEvaluation>((resolve, reject) => {
    activeSearch = {
      resolve,
      reject,
      info: {
        bestMove: null,
        pv: [],
        scoreCp: null,
        mate: null,
        depth: null,
      },
    };

    sendToEngine(`go movetime ${moveTimeMs}`);
  });
}

function handleEngineMessage(event: MessageEvent<string>): void {
  const payload = event.data;
  const lines = String(payload)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    processEngineLine(line);
  }
}

function processEngineLine(line: string): void {
  if (line.startsWith("id name")) {
    engineName = line.replace("id name", "").trim();
    return;
  }

  if (line === "uciok") {
    sendToEngine("setoption name Hash value 16");
    sendToEngine("setoption name UCI_ShowWDL value false");
    sendToEngine("isready");
    return;
  }

  if (line === "readyok") {
    readyResolver?.();
    readyResolver = null;
    readyRejector = null;
    emitStatus("ready", initRequestId, "Ready");
    return;
  }

  if (!activeSearch) {
    return;
  }

  if (line.startsWith("info")) {
    activeSearch.info = parseInfoLine(line, activeSearch.info);
    return;
  }

  if (line.startsWith("bestmove")) {
    const bestMove = line.split(" ")[1];
    activeSearch.resolve({
      bestMove,
      pv: activeSearch.info.pv,
      scoreCp: activeSearch.info.scoreCp,
      mate: activeSearch.info.mate,
      depth: activeSearch.info.depth,
    });
    activeSearch = null;
  }
}

function parseInfoLine(line: string, previous: EngineInfoSnapshot): EngineInfoSnapshot {
  const depth = matchNumber(line, / depth (\d+)/);
  const scoreCp = matchNumber(line, / score cp (-?\d+)/);
  const mate = matchNumber(line, / score mate (-?\d+)/);
  const pvMatch = line.match(/ pv (.+)$/);

  return {
    bestMove: previous.bestMove,
    pv: pvMatch ? pvMatch[1].trim().split(/\s+/) : previous.pv,
    scoreCp: scoreCp ?? previous.scoreCp,
    mate: mate ?? previous.mate,
    depth: depth ?? previous.depth,
  };
}

function configureDifficulty(difficulty: SearchRequest["difficulty"]): void {
  if (difficulty.uciElo) {
    sendToEngine("setoption name UCI_LimitStrength value true");
    sendToEngine(`setoption name UCI_Elo value ${difficulty.uciElo}`);
  } else {
    sendToEngine("setoption name UCI_LimitStrength value false");
  }

  sendToEngine(`setoption name Skill Level value ${difficulty.skillLevelFallback}`);
}

function sendPosition(fen: string): void {
  sendToEngine(`position fen ${fen}`);
}

function sendToEngine(command: string): void {
  engineWorker?.postMessage(command);
}

function emitStatus(
  phase: "loading" | "ready" | "thinking" | "analyzing" | "error",
  requestId: string,
  message: string,
): void {
  postResponse({
    type: "status",
    phase,
    requestId,
    message,
  });
}

function postResponse(message: EngineResponse): void {
  workerScope.postMessage(message);
}

function matchNumber(line: string, pattern: RegExp): number | null {
  const match = line.match(pattern);
  return match ? Number(match[1]) : null;
}
