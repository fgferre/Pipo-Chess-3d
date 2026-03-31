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
  const evaluationsByPly: AnalysisSummary["evaluationsByPly"] = {};
  const criticalMoments: AnalysisSummary["criticalMoments"] = [];
  const totals = {
    w: { loss: 0, count: 0 },
    b: { loss: 0, count: 0 },
  };

  if (evaluations.length > 0) {
    evaluationsByPly[0] = {
      scoreCp: toWhitePerspective(evaluations[0].before.scoreCp, evaluations[0].item.fenBefore),
      scoreMate: toWhitePerspective(evaluations[0].before.mate, evaluations[0].item.fenBefore),
    };
  }

  for (const evaluation of evaluations) {
    const beforeScore = normalizeScore(evaluation.before);
    const afterScore = -normalizeScore(evaluation.after);
    const swingCp = Math.max(0, beforeScore - afterScore);
    const improvementCp = afterScore - beforeScore;
    const tag = classifyMove({
      isBestMove: evaluation.item.playedMoveUci === evaluation.before.bestMove,
      swingCp,
      improvementCp,
      before: evaluation.before,
      after: evaluation.after,
    });

    tagsByPly[evaluation.item.ply] = tag;
    evaluationsByPly[evaluation.item.ply] = {
      scoreCp: toWhitePerspective(evaluation.after.scoreCp, evaluation.item.fenAfter),
      scoreMate: toWhitePerspective(evaluation.after.mate, evaluation.item.fenAfter),
    };
    totals[evaluation.item.mover].loss += swingCp;
    totals[evaluation.item.mover].count += 1;

    criticalMoments.push({
      ply: evaluation.item.ply,
      moveUci: evaluation.item.playedMoveUci,
      san: evaluation.item.san,
      tag,
      swingCp,
      bestLine: evaluation.before.pv,
      scoreCp: toWhitePerspective(evaluation.before.scoreCp, evaluation.item.fenBefore),
      scoreMate: toWhitePerspective(evaluation.before.mate, evaluation.item.fenBefore),
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
    evaluationsByPly,
  };
}

function classifyMove({
  isBestMove,
  swingCp,
  improvementCp,
  before,
  after,
}: {
  isBestMove: boolean;
  swingCp: number;
  improvementCp: number;
  before: EngineEvaluation;
  after: EngineEvaluation;
}): MoveTag {
  if (isBestMove && (improvementCp >= 250 || improvesMateEvaluation(before, after))) {
    return "brilliant";
  }

  if (isBestMove || swingCp < 20) {
    return "good";
  }

  if (swingCp < 80) {
    return "inaccuracy";
  }

  if (swingCp < 160) {
    return "mistake";
  }

  return "blunder";
}

function improvesMateEvaluation(before: EngineEvaluation, after: EngineEvaluation): boolean {
  if (before.mate === null && after.mate === null) {
    return false;
  }

  const beforeScore = normalizeScore(before);
  const afterScore = -normalizeScore(after);
  return afterScore > beforeScore;
}

function normalizeScore(evaluation: EngineEvaluation): number {
  if (evaluation.mate !== null) {
    return evaluation.mate > 0 ? 10_000 : -10_000;
  }

  return evaluation.scoreCp ?? 0;
}

function toWhitePerspective(score: number | null, fen: string): number | null {
  if (score === null) {
    return null;
  }

  return getSideToMove(fen) === "b" ? -score : score;
}

function getSideToMove(fen: string): "w" | "b" {
  const sideToMove = fen.split(" ")[1];
  return sideToMove === "b" ? "b" : "w";
}
