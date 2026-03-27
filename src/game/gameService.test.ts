import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  createNewSession,
  diagnoseIllegalMove,
  formatIllegalMoveDiagnosis,
  getCheckedKingSquare,
  getCurrentRepetitionCount,
  getFiftyMoveRulePressure,
  getLowTimeState,
  isSessionInCheck,
  sessionFromPgn,
} from "./gameService";

describe("gameService feedback helpers", () => {
  it("counts the current repetition from the live position", () => {
    const session = sessionFromPgn("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8", createDefaultSettings());

    expect(getCurrentRepetitionCount(session)).toBe(3);
  });

  it("flags the 50-move rule pressure at warning and critical thresholds", () => {
    const session = createNewSession();

    expect(
      getFiftyMoveRulePressure({
        ...session,
        snapshot: { ...session.snapshot, fen: "8/8/8/8/8/8/8/4K3 w - - 96 1" },
      }),
    ).toEqual({ halfmoveClock: 96, state: "warning" });

    expect(
      getFiftyMoveRulePressure({
        ...session,
        snapshot: { ...session.snapshot, fen: "8/8/8/8/8/8/8/4K3 w - - 98 1" },
      }),
    ).toEqual({ halfmoveClock: 98, state: "critical" });
  });

  it("reports low-time pressure by color", () => {
    const session = createNewSession({
      ...createDefaultSettings(),
      clockConfig: {
        enabled: true,
        label: "5 min",
        baseMs: 300_000,
        incrementMs: 0,
      },
    });

    expect(
      getLowTimeState({
        ...session,
        snapshot: {
          ...session.snapshot,
          clockState: {
            ...session.snapshot.clockState,
            whiteMs: 29_000,
            blackMs: 45_000,
          },
        },
      }),
    ).toEqual({
      thresholdMs: 30_000,
      byColor: { w: true, b: false },
    });
  });

  it("keeps the checked king square available on checkmate positions", () => {
    const session = sessionFromPgn("1. f3 e5 2. g4 Qh4#", createDefaultSettings());

    expect(getCheckedKingSquare(session)).toBe("e1");
    expect(isSessionInCheck(session)).toBe(false);
  });

  it("diagnoses blocked castling with a specific reason and message", () => {
    const session = sessionFromPgn("1. Nf3", createDefaultSettings());
    const diagnosis = diagnoseIllegalMove(session, "e1", "g1");
    const formatted = formatIllegalMoveDiagnosis(diagnosis, "pt-BR");

    expect(diagnosis.reason).toBe("castling-blocked");
    expect(formatted.summary).toBe("Roque bloqueado");
    expect(formatted.detail).toContain("f1");
  });
});
