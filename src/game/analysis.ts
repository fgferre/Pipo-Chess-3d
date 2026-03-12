import { Chess } from "chess.js";
import type {
  AnalysisSummary,
  AnalysisWorkItem,
  EngineAnalysisPayload,
  EngineEvaluation,
  GameSession,
  MoveTag,
} from "../types/game";

interface EvaluatedWorkItem {
  item: AnalysisWorkItem;
  before: EngineEvaluation;
  after: EngineEvaluation;
}

export function buildAnalysisPayload(session: GameSession): EngineAnalysisPayload {
  return {
    result: session.snapshot.status,
    workItems: session.moveEntries.map((entry) => ({
      ply: entry.ply,
      fenBefore: entry.beforeFen,
      fenAfter: entry.afterFen,
      playedMoveUci: entry.uci,
      san: entry.san,
      mover: entry.color,
    })),
  };
}

export function buildAnalysisSummary(
  payload: EngineAnalysisPayload,
  evaluations: EvaluatedWorkItem[],
): AnalysisSummary {
  const tagsByPly: Record<number, MoveTag> = {};
  const criticalMoments: AnalysisSummary["criticalMoments"] = [];
  const totals = {
    w: { loss: 0, count: 0 },
    b: { loss: 0, count: 0 },
  };

  for (const evaluation of evaluations) {
    const beforeScore = normalizeScore(evaluation.before);
    const afterScore = -normalizeScore(evaluation.after);
    const swingCp = Math.max(0, beforeScore - afterScore);
    const tag = classifyMove(evaluation.item.playedMoveUci === evaluation.before.bestMove, swingCp);

    tagsByPly[evaluation.item.ply] = tag;
    totals[evaluation.item.mover].loss += swingCp;
    totals[evaluation.item.mover].count += 1;

    criticalMoments.push({
      ply: evaluation.item.ply,
      moveUci: evaluation.item.playedMoveUci,
      san: evaluation.item.san,
      tag,
      swingCp,
      bestLine: evaluation.before.pv,
      scoreCp: evaluation.before.scoreCp,
      scoreMate: evaluation.before.mate,
    });
  }

  criticalMoments.sort((left, right) => right.swingCp - left.swingCp);

  return {
    result: payload.result,
    criticalMoments: criticalMoments.slice(0, 3),
    centipawnLossBySide: {
      w: totals.w.count === 0 ? 0 : Math.round(totals.w.loss / totals.w.count),
      b: totals.b.count === 0 ? 0 : Math.round(totals.b.loss / totals.b.count),
    },
    tagsByPly,
  };
}

export function buildAnalysisWorkloadFromPgn(pgn: string): AnalysisWorkItem[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const replay = new Chess();

  return history.map((move, index) => {
    const beforeFen = replay.fen();
    replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });

    return {
      ply: index + 1,
      fenBefore: beforeFen,
      fenAfter: replay.fen(),
      playedMoveUci: `${move.from}${move.to}${move.promotion ?? ""}`,
      san: move.san,
      mover: move.color,
    };
  });
}

function classifyMove(isBestMove: boolean, swingCp: number): MoveTag {
  if (isBestMove || swingCp < 20) {
    return "best";
  }

  if (swingCp < 80) {
    return "inaccuracy";
  }

  if (swingCp < 160) {
    return "mistake";
  }

  return "blunder";
}

function normalizeScore(evaluation: EngineEvaluation): number {
  if (evaluation.mate !== null) {
    return evaluation.mate > 0 ? 10_000 : -10_000;
  }

  return evaluation.scoreCp ?? 0;
}
