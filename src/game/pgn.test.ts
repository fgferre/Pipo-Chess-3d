import { describe, expect, it } from "vitest";
import { createNewSession, sessionFromPgn, setSessionSettings } from "./gameService";

describe("PGN headers", () => {
  it("round-trips custom Pipo headers", () => {
    const session = setSessionSettings(createNewSession(), {
      ...createNewSession().settings,
      difficultyId: "master",
      themeId: "emerald",
      locale: "en",
      orientation: "black",
      clockConfig: {
        enabled: true,
        label: "15 + 10",
        baseMs: 900_000,
        incrementMs: 10_000,
      },
    });

    const restored = sessionFromPgn(session.snapshot.pgn, createNewSession().settings);

    expect(restored.settings.difficultyId).toBe("master");
    expect(restored.settings.themeId).toBe("emerald");
    expect(restored.settings.locale).toBe("en");
    expect(restored.settings.orientation).toBe("black");
    expect(restored.settings.clockConfig.baseMs).toBe(900_000);
    expect(restored.settings.clockConfig.incrementMs).toBe(10_000);
    expect(restored.settings.animationMode).toBe(createNewSession().settings.animationMode);
    expect(restored.settings.defaultViewMode).toBe(createNewSession().settings.defaultViewMode);
  });

  it("falls back to the current clock config when custom clock headers are missing", () => {
    const fallback = setSessionSettings(createNewSession(), {
      ...createNewSession().settings,
      locale: "en",
      clockConfig: {
        enabled: true,
        label: "5 + 0",
        baseMs: 300_000,
        incrementMs: 0,
      },
    }).settings;

    const restored = sessionFromPgn("1. e4 e5 2. Nf3 Nc6", fallback);

    expect(restored.settings.locale).toBe("en");
    expect(restored.settings.clockConfig.enabled).toBe(true);
    expect(restored.settings.clockConfig.baseMs).toBe(300_000);
    expect(restored.snapshot.moveList).toHaveLength(4);
    expect(restored.settings.animationMode).toBe(fallback.animationMode);
    expect(restored.settings.defaultViewMode).toBe(fallback.defaultViewMode);
  });

  it("retains fallback animationMode and defaultViewMode when PGN headers do not define them", () => {
    const fallback = {
      ...createNewSession().settings,
      animationMode: "reduced" as const,
      defaultViewMode: "2d" as const,
    };

    const restored = sessionFromPgn("1. d4 d5", fallback);

    expect(restored.settings.animationMode).toBe("reduced");
    expect(restored.settings.defaultViewMode).toBe("2d");
  });
});
