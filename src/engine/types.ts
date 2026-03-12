import type { DifficultyPreset, EngineAnalysisPayload, AnalysisSummary } from "../types/game";

export interface InitEngineRequest {
  type: "init";
  requestId: string;
  scriptUrl: string;
  wasmUrl: string;
}

export interface NewGameRequest {
  type: "newGame";
  requestId: string;
}

export interface SetPositionRequest {
  type: "setPosition";
  requestId: string;
  fen: string;
}

export interface SearchRequest {
  type: "search";
  requestId: string;
  fen?: string;
  difficulty: DifficultyPreset;
  moveTimeMs?: number;
}

export interface HintRequest {
  type: "hint";
  requestId: string;
  fen?: string;
  difficulty: DifficultyPreset;
}

export interface AnalyzeRequest {
  type: "analyze";
  requestId: string;
  payload: EngineAnalysisPayload;
  moveTimeMs: number;
}

export interface StopRequest {
  type: "stop";
  requestId: string;
}

export type EngineRequest =
  | InitEngineRequest
  | NewGameRequest
  | SetPositionRequest
  | SearchRequest
  | HintRequest
  | AnalyzeRequest
  | StopRequest;

export interface ReadyResponse {
  type: "ready";
  requestId: string;
  engineName: string;
}

export interface StatusResponse {
  type: "status";
  phase: "loading" | "ready" | "thinking" | "analyzing" | "error";
  requestId: string;
  message?: string;
}

export interface PositionAckResponse {
  type: "positionAck";
  requestId: string;
}

export interface SearchResultResponse {
  type: "searchResult";
  requestId: string;
  bestMove: string;
  pv: string[];
  scoreCp: number | null;
  mate: number | null;
  depth: number | null;
}

export interface HintResultResponse extends Omit<SearchResultResponse, "type"> {
  type: "hintResult";
}

export interface AnalysisProgressResponse {
  type: "analysisProgress";
  requestId: string;
  completed: number;
  total: number;
  currentPly: number;
}

export interface AnalysisResultResponse {
  type: "analysisResult";
  requestId: string;
  summary: AnalysisSummary;
}

export interface ErrorResponse {
  type: "error";
  requestId: string;
  message: string;
}

export type EngineResponse =
  | ReadyResponse
  | StatusResponse
  | PositionAckResponse
  | SearchResultResponse
  | HintResultResponse
  | AnalysisProgressResponse
  | AnalysisResultResponse
  | ErrorResponse;
