import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEngineMove,
  applyPlayerMove,
  createDefaultSettings,
  createNewSession,
  getCastlingTargetsForSquare,
  hydrateSession,
  redoTurn,
  sessionFromPgn,
  undoTurn,
} from "./gameService";

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
    // Clock is paused until the first move — no time lost before e4
    vi.setSystemTime(new Date("2025-01-01T00:00:05.000Z"));
    session = applyPlayerMove(session, "e2", "e4")!;
    vi.setSystemTime(new Date("2025-01-01T00:00:08.000Z"));
    session = applyEngineMove(session, "e7e5");
    vi.setSystemTime(new Date("2025-01-01T00:00:12.000Z"));
    session = applyPlayerMove(session, "g1", "f3")!;
    vi.setSystemTime(new Date("2025-01-01T00:00:14.000Z"));
    session = applyEngineMove(session, "b8c6");

    const undone = undoTurn(session);
    expect(undone.snapshot.clockState.whiteMs).toBe(60_000);
    expect(undone.snapshot.clockState.blackMs).toBe(57_000);
    expect(undone.snapshot.clockState.activeColor).toBe("w");

    const redone = redoTurn(undone);
    expect(redone.snapshot.clockState.whiteMs).toBe(56_000);
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

    // Player is white — first move starts the clock
    let session = createNewSession(settings, { playerColor: "w" });
    session = applyPlayerMove(session, "e2", "e4")!;
    // Clock is now running for black; advance past black's 1s budget
    vi.setSystemTime(new Date("2025-01-01T00:00:01.500Z"));
    const timedOut = applyEngineMove(session, "e7e5");

    expect(timedOut.snapshot.status).toBe("timeout");
    expect(timedOut.snapshot.moveList).toHaveLength(1);
    expect(timedOut.snapshot.clockState.expiredColor).toBe("b");
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

  it("hydrates legacy sessions without quality fields using the fallback quality settings", () => {
    const fallback = {
      ...createDefaultSettings(),
      qualityMode: "manual" as const,
      manualQualityTier: 1 as const,
    };
    const legacySession = createNewSession();
    const legacySettings = { ...legacySession.settings } as Partial<typeof legacySession.settings>;
    delete (legacySettings as { qualityMode?: unknown }).qualityMode;
    delete (legacySettings as { manualQualityTier?: unknown }).manualQualityTier;

    const hydrated = hydrateSession(
      {
        ...legacySession,
        settings: legacySettings as typeof legacySession.settings,
      },
      fallback,
    );

    expect(hydrated.settings.qualityMode).toBe("manual");
    expect(hydrated.settings.manualQualityTier).toBe(1);
  });

  it("returns castling target squares when castling is available", () => {
    const session = createNewSession();
    const targets = getCastlingTargetsForSquare(session, "e1");
    expect(targets).toHaveLength(0);

    let advanced = applyPlayerMove(session, "e2", "e4")!;
    advanced = applyEngineMove(advanced, "e7e5")!;
    advanced = applyPlayerMove(advanced, "g1", "f3")!;
    advanced = applyEngineMove(advanced, "b8c6")!;
    advanced = applyPlayerMove(advanced, "f1", "c4")!;
    advanced = applyEngineMove(advanced, "d7d6")!;

    const castlingTargets = getCastlingTargetsForSquare(advanced, "e1");
    expect(castlingTargets).toContain("g1");
    expect(castlingTargets).toHaveLength(1);
  });

  it("returns empty castling targets for non-king pieces", () => {
    const session = createNewSession();
    const targets = getCastlingTargetsForSquare(session, "e2");
    expect(targets).toHaveLength(0);
  });
});
