import { describe, expect, it } from "vitest";
import { applyEngineMove, applyPlayerMove, createNewSession } from "./gameService";
import { buildAnalysisPayload, buildAnalysisSummary } from "./analysis";

describe("analysis", () => {
  it("stores evaluationsByPly normalized to white perspective", () => {
    let session = createNewSession();
    session = applyPlayerMove(session, "e2", "e4")!;
    session = applyEngineMove(session, "c7c5");

    const payload = buildAnalysisPayload(session);
    const summary = buildAnalysisSummary(payload, [
      {
        item: payload.workItems[0],
        before: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 18, mate: null, depth: 14 },
        after: { bestMove: "c7c5", pv: ["c7c5"], scoreCp: 42, mate: null, depth: 14 },
      },
      {
        item: payload.workItems[1],
        before: { bestMove: "c7c5", pv: ["c7c5"], scoreCp: 42, mate: null, depth: 14 },
        after: { bestMove: "g1f3", pv: ["g1f3"], scoreCp: 15, mate: null, depth: 14 },
      },
    ]);

    expect(summary.evaluationsByPly).toEqual({
      0: { scoreCp: 18, scoreMate: null },
      1: { scoreCp: -42, scoreMate: null },
      2: { scoreCp: 15, scoreMate: null },
    });
    expect(summary.criticalMoments.find((moment) => moment.ply === 2)?.scoreCp).toBe(-42);
    expect(summary.tagsByPly[1]).toBe("good");
  });

  it("normalizes mate scores using the side to move in each position", () => {
    let session = createNewSession();
    session = applyPlayerMove(session, "f2", "f3")!;

    const payload = buildAnalysisPayload(session);
    const summary = buildAnalysisSummary(payload, [
      {
        item: payload.workItems[0],
        before: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 0, mate: null, depth: 12 },
        after: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: null, mate: 3, depth: 12 },
      },
    ]);

    expect(summary.evaluationsByPly).toEqual({
      0: { scoreCp: 0, scoreMate: null },
      1: { scoreCp: null, scoreMate: -3 },
    });
  });

  it("classifies standout best moves as brilliant", () => {
    const session = createNewSession();
    const payload = buildAnalysisPayload(session);
    const summary = buildAnalysisSummary(payload, [
      {
        item: {
          ply: 1,
          fenBefore: session.snapshot.fen,
          fenAfter: session.snapshot.fen,
          playedMoveUci: "e2e4",
          san: "e4",
          mover: "w",
        },
        before: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: -120, mate: null, depth: 14 },
        after: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: -420, mate: null, depth: 14 },
      },
    ]);

    expect(summary.tagsByPly[1]).toBe("brilliant");
  });

  it("uses the 5-class taxonomy thresholds for non-best moves", () => {
    const session = createNewSession();
    const payload = buildAnalysisPayload(session);
    const summary = buildAnalysisSummary(payload, [
      {
        item: {
          ply: 1,
          fenBefore: session.snapshot.fen,
          fenAfter: session.snapshot.fen,
          playedMoveUci: "a2a3",
          san: "a3",
          mover: "w",
        },
        before: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 100, mate: null, depth: 12 },
        after: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: -40, mate: null, depth: 12 },
      },
      {
        item: {
          ply: 2,
          fenBefore: session.snapshot.fen,
          fenAfter: session.snapshot.fen,
          playedMoveUci: "a7a6",
          san: "a6",
          mover: "b",
        },
        before: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: 100, mate: null, depth: 12 },
        after: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: -10, mate: null, depth: 12 },
      },
      {
        item: {
          ply: 3,
          fenBefore: session.snapshot.fen,
          fenAfter: session.snapshot.fen,
          playedMoveUci: "h2h4",
          san: "h4",
          mover: "w",
        },
        before: { bestMove: "e2e4", pv: ["e2e4"], scoreCp: 180, mate: null, depth: 12 },
        after: { bestMove: "e7e5", pv: ["e7e5"], scoreCp: 10, mate: null, depth: 12 },
      },
    ]);

    expect(summary.tagsByPly[1]).toBe("inaccuracy");
    expect(summary.tagsByPly[2]).toBe("mistake");
    expect(summary.tagsByPly[3]).toBe("blunder");
  });
});
