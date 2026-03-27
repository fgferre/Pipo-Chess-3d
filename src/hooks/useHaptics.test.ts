import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installVibrateMock() {
  const vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

describe("useHaptics", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it.each([
    ["light", 10],
    ["medium", 25],
    ["heavy", [40, 18, 28]],
    ["check", [28, 16, 55]],
    ["gameOver", [30, 20, 30, 20, 60]],
  ] as const)("sends the expected vibration pattern for %s", async (method, pattern) => {
    const vibrate = installVibrateMock();
    const { haptics } = await import("./useHaptics");

    haptics[method]();

    expect(vibrate).toHaveBeenCalledWith(pattern);
  });

  it("ignores vibration errors without throwing", async () => {
    const vibrate = installVibrateMock();
    vibrate.mockImplementation(() => {
      throw new Error("blocked");
    });

    const { haptics } = await import("./useHaptics");

    expect(() => haptics.light()).not.toThrow();
  });
});
