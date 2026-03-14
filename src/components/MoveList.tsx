import type { AnalysisSummary, SerializableMove } from "../types/game";

interface MoveListProps {
  moves: SerializableMove[];
  selectedPly?: number | null;
  onSelectPly?: (ply: number) => void;
  tagsByPly?: AnalysisSummary["tagsByPly"];
}

export function MoveList({ moves, selectedPly = null, onSelectPly, tagsByPly }: MoveListProps) {
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
          <MoveCell
            move={turn.white}
            selectedPly={selectedPly}
            onSelectPly={onSelectPly}
            tag={turn.white ? tagsByPly?.[turn.white.ply] : undefined}
          />
          <MoveCell
            move={turn.black}
            selectedPly={selectedPly}
            onSelectPly={onSelectPly}
            tag={turn.black ? tagsByPly?.[turn.black.ply] : undefined}
          />
        </div>
      ))}
    </div>
  );
}

interface MoveCellProps {
  move?: SerializableMove;
  selectedPly: number | null;
  onSelectPly?: (ply: number) => void;
  tag?: AnalysisSummary["tagsByPly"][number];
}

function MoveCell({ move, selectedPly, onSelectPly, tag }: MoveCellProps) {
  if (!move) {
    return <span className="move-cell move-cell--empty" />;
  }

  const selected = selectedPly === move.ply;
  const content = (
    <>
      <span>{move.san}</span>
      {tag ? <small className={`move-tag move-tag--${tag}`}>{tag}</small> : null}
    </>
  );

  if (!onSelectPly) {
    return <span className={`move-cell ${selected ? "is-selected" : ""}`}>{content}</span>;
  }

  return (
    <button
      className={`move-cell ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={() => onSelectPly(move.ply)}
    >
      {content}
    </button>
  );
}
