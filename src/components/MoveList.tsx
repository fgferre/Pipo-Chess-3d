import type { SerializableMove } from "../types/game";

interface MoveListProps {
  moves: SerializableMove[];
}

export function MoveList({ moves }: MoveListProps) {
  const groupedMoves = [];

  for (let index = 0; index < moves.length; index += 2) {
    groupedMoves.push({
      turn: index / 2 + 1,
      white: moves[index],
      black: moves[index + 1],
    });
  }

  return (
    <div className="move-list">
      {groupedMoves.map((turn) => (
        <div className="move-row" key={turn.turn}>
          <span className="move-row__turn">{turn.turn}.</span>
          <span>{turn.white?.san ?? ""}</span>
          <span>{turn.black?.san ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
