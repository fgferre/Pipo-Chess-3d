import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportTextContent } from "./files";

describe("exportTextContent", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("uses the Web Share API when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { ...originalNavigator, share },
      configurable: true,
    });

    await expect(exportTextContent("game.pgn", "1. e4 e5", "Game PGN")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Game PGN",
      text: "1. e4 e5",
    });
  });

  it("falls back to the clipboard when sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: { ...originalNavigator, clipboard: { writeText } },
      configurable: true,
    });

    await expect(exportTextContent("game.pgn", "1. e4 e5")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("1. e4 e5");
  });

  it("returns cancelled when the share sheet is dismissed", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: { ...originalNavigator, share, clipboard: { writeText } },
      configurable: true,
    });

    await expect(exportTextContent("game.pgn", "1. e4 e5")).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to a file download when neither share nor clipboard are usable", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { ...originalNavigator, clipboard: undefined, share: undefined },
      configurable: true,
    });

    await expect(exportTextContent("game.pgn", "1. e4 e5")).resolves.toBe("downloaded");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
