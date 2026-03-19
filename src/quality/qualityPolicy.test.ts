import { describe, expect, it } from "vitest";
import {
  QUALITY_AUTO_DOWNGRADE_COOLDOWN_MS,
  QUALITY_DEFAULT_TIER,
  QUALITY_FPS_THRESHOLD,
  createQualityMonitorState,
  estimateInitialQualityTier,
  normalizeQualitySettings,
  resolveEffectiveQualityTier,
  updateQualityMonitorState,
} from "./qualityPolicy";

describe("qualityPolicy", () => {
  it("normalizes quality settings to the supported defaults", () => {
    expect(normalizeQualitySettings()).toEqual({
      qualityMode: "auto",
      manualQualityTier: QUALITY_DEFAULT_TIER,
    });

    expect(
      normalizeQualitySettings({
        qualityMode: "manual",
        manualQualityTier: 9,
      }),
    ).toEqual({
      qualityMode: "manual",
      manualQualityTier: QUALITY_DEFAULT_TIER,
    });
  });

  it("resolves the effective tier from auto and manual preference", () => {
    expect(
      resolveEffectiveQualityTier(
        {
          qualityMode: "auto",
          manualQualityTier: 1,
        },
        3,
      ),
    ).toBe(3);

    expect(
      resolveEffectiveQualityTier(
        {
          qualityMode: "manual",
          manualQualityTier: 1,
        },
        3,
      ),
    ).toBe(1);
  });

  it("downgrades only after sustained low FPS and respects cooldown", () => {
    const initialState = createQualityMonitorState();

    const belowThreshold = updateQualityMonitorState(initialState, {
      currentTier: 3,
      fps: QUALITY_FPS_THRESHOLD - 1,
      nowMs: 1_000,
    });

    expect(belowThreshold.nextTier).toBeNull();
    expect(belowThreshold.nextState.lowFpsSinceMs).toBe(1_000);

    const sustained = updateQualityMonitorState(belowThreshold.nextState, {
      currentTier: 3,
      fps: QUALITY_FPS_THRESHOLD - 5,
      nowMs: 1_000 + 3_100,
    });

    expect(sustained.nextTier).toBe(2);
    expect(sustained.nextState.lastAutoDowngradeAtMs).toBe(1_000 + 3_100);

    const cooldownBlocked = updateQualityMonitorState(sustained.nextState, {
      currentTier: 2,
      fps: QUALITY_FPS_THRESHOLD - 2,
      nowMs: 1_000 + 3_100 + QUALITY_AUTO_DOWNGRADE_COOLDOWN_MS - 1,
    });

    expect(cooldownBlocked.nextTier).toBeNull();
  });

  it("never suggests a downgrade below tier 1", () => {
    const initialState = createQualityMonitorState();

    const belowThreshold = updateQualityMonitorState(initialState, {
      currentTier: 1,
      fps: QUALITY_FPS_THRESHOLD - 5,
      nowMs: 1_000,
    });
    const sustained = updateQualityMonitorState(belowThreshold.nextState, {
      currentTier: 1,
      fps: QUALITY_FPS_THRESHOLD - 5,
      nowMs: 4_500,
    });

    expect(sustained.nextTier).toBeNull();
  });

  it("estimates the initial tier from hardware hints", () => {
    expect(
      estimateInitialQualityTier({
        renderer: "ANGLE (Intel HD Graphics 630)",
        deviceMemoryGb: 8,
        isMobile: false,
      }),
    ).toBe(1);

    expect(
      estimateInitialQualityTier({
        renderer: "ANGLE (Apple GPU)",
        deviceMemoryGb: 8,
        isMobile: false,
      }),
    ).toBe(3);
  });
});
