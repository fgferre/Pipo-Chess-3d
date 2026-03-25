import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourceDir = resolve("node_modules/stockfish/src");
const outputDir = resolve("public/assets/stockfish");

await mkdir(outputDir, { recursive: true });

for (const file of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  await copyFile(resolve(sourceDir, file), resolve(outputDir, file));
}

await mkdir(dirname(resolve(outputDir, ".keep")), { recursive: true });
