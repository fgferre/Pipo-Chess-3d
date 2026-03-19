import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEngineMove,
  applyPlayerMove,
  createDefaultSettings,
  createNewSession,
  diagnoseIllegalMove,
  formatIllegalMoveDiagnosis,
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

  it("diagnoses a pinned piece that shields the king", () => {
    // 1.e4 e5 2.Bc4 Nf6 3.d3 — bishop on c8 is free, but let's set up a pin:
    // 1.e4 d5 2.exd5 Nc6 3.Bb5 — d7 pawn gone, Bb5 pins Nc6 to Ke8
    const session = sessionFromPgn("1. e4 d5 2. exd5 Nc6 3. Bb5", createDefaultSettings());
    // Nc6 is pinned by Bb5 to Ke8 along b5-c6-d7-e8 diagonal (d7 is clear).
    const diagnosis = diagnoseIllegalMove(session, "c6", "d4");

    expect(diagnosis.reason).toBe("pinned");
    expect(diagnosis.attackerSquares).toContain("b5");
    expect(diagnosis.attackerTypes).toContain("b");
  });

  it("diagnoses moving king into check", () => {
    // After 1.e4 e5, try moving black king to e7 (white pawn controls d6... no).
    // Simpler: from starting position, try white king to e2 — blocked by pawn. Let's clear path.
    // After 1.e4 e5 2.Ke2 is illegal because d1 queen defends but Ke2 isn't attacked...
    // Actually Ke2 IS legal after 1.e4 e5. Let's find a real case.
    // After 1.e4 d5 2.Bb5+ Bd7 — it's white's turn, king is on e1.
    // Actually let's use: position where king would move into an attacked square.
    // 1.d4 e5 2.dxe5 Qg5 — white to move. If white tries Kd2, is it attacked? Qg5 doesn't attack d2.
    // Simplest: use a FEN. After 1.e4 e5, if black tries Ke7, that's actually legal (just bad).
    // Let's use: 1.f3 e5 2.g4 — if we try Kf2 it's legal. Hmm.
    // Use PGN to create position where king move is illegal:
    // After 1.e4 e5 2.Qh5, black to move. If black tries Ke7, the queen on h5 attacks e8 not e7...
    // Qh5 attacks f7 and e8? No, Qh5 attacks h4,g4,f3,g5,f5,e5,h6,h7,h8,g6,f7,e8.
    // So Ke7 would not be in check from Qh5. But d8 queen is there...
    // Let's just use a custom session with known FEN via sessionFromPgn.
    // After 1.e4 e5 2.Qf3 Nc6 3.Bc4 — tries Ke7 by black, but Qf3 doesn't attack e7.
    // Let me try: position with black Ke8, white Re1. If Ke7 then Re1 checks along e-file? No Re1 is blocked by e2 pawn.
    // Enough overthinking. Use a direct scenario:
    // 1.e4 e5 2.Qh5 — Qh5 attacks e8 diagonally. If black tries Ke7... Qh5 doesn't attack e7.
    // Wait — Qh5 to e8: h5-g6-f7-e8. Yes, Qh5 attacks e8 along the diagonal.
    // So after 1.e4 e5 2.Qh5, the black king on e8 cannot stay because... it's not in check yet.
    // For king moves into check: 1.e4 e5 2.Qh5 Ke7 is actually legal (it's just terrible).
    //
    // Let me use an actual check scenario: after 1.e4 e5 2.Qh5 Nf6, white plays Qxe5+.
    // Now black king is in check. If black tries Ke7: Qe5 attacks e7? Q on e5 attacks e6,e7,e8 along file. Yes!
    const session = sessionFromPgn("1. e4 e5 2. Qh5 Nf6 3. Qxe5+", createDefaultSettings());
    // Black is in check from Qe5. Trying Ke7 — queen on e5 attacks e7 along the e-file.
    const diagnosis = diagnoseIllegalMove(session, "e8", "e7");

    expect(diagnosis.reason).toBe("exposes-king");
    expect(diagnosis.attackerSquares).toContain("e5");
    expect(diagnosis.attackerTypes).toContain("q");
  });

  it("diagnoses a blocked move (piece cannot reach target)", () => {
    const session = createNewSession();
    // Try moving white pawn e2 diagonally to d3 (no capture available)
    const diagnosis = diagnoseIllegalMove(session, "e2", "d3");

    expect(diagnosis.reason).toBe("blocked");
    expect(diagnosis.attackerSquares).toHaveLength(0);
  });

  it("formats diagnosis messages in both locales", () => {
    const diagnosis = {
      reason: "pinned" as const,
      attackerSquares: ["b5" as const],
      attackerTypes: ["b" as const],
    };

    const ptBR = formatIllegalMoveDiagnosis(diagnosis, "pt-BR");
    expect(ptBR.summary).toBe("Peça presa");
    expect(ptBR.detail).toContain("Bispo");
    expect(ptBR.detail).toContain("b5");

    const en = formatIllegalMoveDiagnosis(diagnosis, "en");
    expect(en.summary).toBe("Pinned piece");
    expect(en.detail).toContain("Bishop");
    expect(en.detail).toContain("b5");
  });
});
