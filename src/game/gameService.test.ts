import { describe, expect, it } from "vitest";
import { applyEngineMove, applyPlayerMove, createNewSession, redoTurn, sessionFromPgn, undoTurn } from "./gameService";

describe("gameService", () => {
  it("undoes and redoes a full turn", () => {
    let session = createNewSession();
    session = applyPlayerMove(session, "e2", "e4")!;
    session = applyEngineMove(session, "e7e5");

    expect(session.snapshot.moveList).toHaveLength(2);

    const undone = undoTurn(session);
    expect(undone.snapshot.moveList).toHaveLength(0);
    expect(undone.snapshot.canRedo).toBe(true);

    const redone = redoTurn(undone);
    expect(redone.snapshot.moveList).toHaveLength(2);
    expect(redone.snapshot.fen).toContain("w KQkq");
  });

  it("detects checkmate from PGN", () => {
    const session = sessionFromPgn("1. f3 e5 2. g4 Qh4#", createNewSession().settings);

    expect(session.snapshot.status).toBe("checkmate");
  });

  it("detects threefold repetition from PGN", () => {
    const pgn = "1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8";
    const session = sessionFromPgn(pgn, createNewSession().settings);

    expect(session.snapshot.status).toBe("threefold");
  });

  it("supports games where the player starts with black and the engine moves first", () => {
    let session = createNewSession(createNewSession().settings, { playerColor: "b" });

    expect(session.playerColor).toBe("b");
    expect(session.snapshot.sideToMove).toBe("w");

    session = applyEngineMove(session, "e2e4");

    expect(session.snapshot.sideToMove).toBe("b");
    expect(session.snapshot.moveList[0]?.uci).toBe("e2e4");
  });
});
