import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEngineMove, applyPlayerMove, createNewSession, redoTurn, sessionFromPgn, undoTurn } from "./gameService";

describe("gameService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("restores clock values for undo and redo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const settings = {
      ...createNewSession().settings,
      clockConfig: {
        enabled: true,
        label: "1 min",
        baseMs: 60_000,
        incrementMs: 0,
      },
    };

    let session = createNewSession(settings);
    vi.setSystemTime(new Date("2025-01-01T00:00:05.000Z"));
    session = applyPlayerMove(session, "e2", "e4")!;
    vi.setSystemTime(new Date("2025-01-01T00:00:08.000Z"));
    session = applyEngineMove(session, "e7e5");
    vi.setSystemTime(new Date("2025-01-01T00:00:12.000Z"));
    session = applyPlayerMove(session, "g1", "f3")!;
    vi.setSystemTime(new Date("2025-01-01T00:00:14.000Z"));
    session = applyEngineMove(session, "b8c6");

    const undone = undoTurn(session);
    expect(undone.snapshot.clockState.whiteMs).toBe(55_000);
    expect(undone.snapshot.clockState.blackMs).toBe(57_000);
    expect(undone.snapshot.clockState.activeColor).toBe("w");

    const redone = redoTurn(undone);
    expect(redone.snapshot.clockState.whiteMs).toBe(51_000);
    expect(redone.snapshot.clockState.blackMs).toBe(55_000);
    expect(redone.snapshot.clockState.activeColor).toBe("w");
  });

  it("does not apply an engine move after the side to move has flagged on time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const settings = {
      ...createNewSession().settings,
      clockConfig: {
        enabled: true,
        label: "1 sec",
        baseMs: 1_000,
        incrementMs: 0,
      },
    };

    const session = createNewSession(settings, { playerColor: "b" });
    vi.setSystemTime(new Date("2025-01-01T00:00:01.500Z"));
    const timedOut = applyEngineMove(session, "e2e4");

    expect(timedOut.snapshot.status).toBe("timeout");
    expect(timedOut.snapshot.moveList).toHaveLength(0);
    expect(timedOut.snapshot.clockState.expiredColor).toBe("w");
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
