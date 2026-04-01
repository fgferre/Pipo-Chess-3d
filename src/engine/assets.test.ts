import { describe, expect, it } from "vitest";
import { withBasePath } from "./assets";

describe("withBasePath", () => {
  it("prefixes asset paths with the root base URL", () => {
    expect(withBasePath("/", "assets/stockfish/stockfish-18-lite-single.js")).toBe(
      "/assets/stockfish/stockfish-18-lite-single.js",
    );
  });

  it("prefixes asset paths with the GitHub Pages base URL", () => {
    expect(withBasePath("/Pipo-Chess-3d/", "assets/stockfish/stockfish-18-lite-single.js")).toBe(
      "/Pipo-Chess-3d/assets/stockfish/stockfish-18-lite-single.js",
    );
  });

  it("normalizes leading slashes in the asset path", () => {
    expect(withBasePath("/Pipo-Chess-3d/", "/assets/stockfish/stockfish-18-lite-single.wasm")).toBe(
      "/Pipo-Chess-3d/assets/stockfish/stockfish-18-lite-single.wasm",
    );
  });
});
