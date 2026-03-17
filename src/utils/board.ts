import type { Color, PieceSymbol, Square } from "chess.js";

export interface BoardPiece {
  square: Square;
  color: Color;
  type: PieceSymbol;
}

export const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export function fenToPieces(fen: string): BoardPiece[] {
  const [position] = fen.split(" ");
  const rows = position.split("/");
  const pieces: BoardPiece[] = [];

  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;

    for (const token of row) {
      if (/\d/.test(token)) {
        fileIndex += Number(token);
        continue;
      }

      const file = files[fileIndex];
      const rank = 8 - rowIndex;
      const square = `${file}${rank}` as Square;
      const isUpper = token === token.toUpperCase();

      pieces.push({
        square,
        color: isUpper ? "w" : "b",
        type: token.toLowerCase() as PieceSymbol,
      });

      fileIndex += 1;
    }
  });

  return pieces;
}

export function squareToCoords(square: Square): { x: number; z: number } {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;

  return {
    x: file - 3.5,
    z: 3.5 - rank,
  };
}

