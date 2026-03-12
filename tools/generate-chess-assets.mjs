import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const outputPath = resolve("public/assets/models/pipo-chess-set.gltf");
const { window } = new JSDOM("", { pretendToBeVisual: true });

globalThis.Blob = window.Blob;
globalThis.FileReader = window.FileReader;

const scene = new Scene();
const board = new Group();
board.name = "Board";

for (let rank = 0; rank < 8; rank += 1) {
  for (let file = 0; file < 8; file += 1) {
    const square = new Mesh(
      new BoxGeometry(1, 0.12, 1),
      new MeshStandardMaterial({ color: (rank + file) % 2 === 0 ? "#dcbf95" : "#6f4d38" }),
    );
    square.name = (rank + file) % 2 === 0 ? "LightSquare" : "DarkSquare";
    square.position.set(file - 3.5, 0, 3.5 - rank);
    board.add(square);
  }
}

const frame = new Mesh(
  new BoxGeometry(9.2, 0.34, 9.2),
  new MeshStandardMaterial({ color: "#2b1f1a" }),
);
frame.name = "BoardFrame";
frame.position.y = -0.18;
board.add(frame);
scene.add(board);

const library = new Group();
library.name = "PieceLibrary";
library.visible = false;

library.add(buildPiece("PawnPrototype", [0.44, 0.48, 0.44], [0.18, 0.18, 0.18]));
library.add(buildPiece("RookPrototype", [0.46, 0.52, 0.46], [0.52, 0.24, 0.52]));
library.add(buildPiece("KnightPrototype", [0.48, 0.56, 0.3], [0.28, 0.3, 0.26]));
library.add(buildPiece("BishopPrototype", [0.42, 0.54, 0.42], [0.24, 0.3, 0.24]));
library.add(buildPiece("QueenPrototype", [0.5, 0.6, 0.5], [0.26, 0.34, 0.26]));
library.add(buildPiece("KingPrototype", [0.5, 0.64, 0.5], [0.22, 0.4, 0.22]));
scene.add(library);

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(scene, { binary: false, onlyVisible: false });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2));

function buildPiece(name, bodySize, crownSize) {
  const group = new Group();
  group.name = name;

  const base = new Mesh(
    new CylinderGeometry(0.3, 0.36, 0.16, 6),
    new MeshStandardMaterial({ color: "#eeeeee" }),
  );
  base.position.y = 0.08;

  const body = new Mesh(
    new BoxGeometry(bodySize[0], bodySize[1], bodySize[2]),
    new MeshStandardMaterial({ color: "#eeeeee" }),
  );
  body.position.y = 0.36;

  const crown = new Mesh(
    new BoxGeometry(crownSize[0], crownSize[1], crownSize[2]),
    new MeshStandardMaterial({ color: "#eeeeee" }),
  );
  crown.position.y = 0.72;

  group.add(base, body, crown);
  return group;
}
