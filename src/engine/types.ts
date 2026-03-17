import type { AnalysisSummary } from "../types/game";

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
  | SearchResultResponse
  | HintResultResponse
  | AnalysisProgressResponse
  | AnalysisResultResponse
  | ErrorResponse;
