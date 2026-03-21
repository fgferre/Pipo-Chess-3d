import { t } from "../i18n";
import type { AnalysisSummary, Locale, SerializableMove } from "../types/game";

interface MoveListProps {
  moves: SerializableMove[];
  locale: Locale;
  selectedPly?: number | null;
  onSelectPly?: (ply: number) => void;
  tagsByPly?: AnalysisSummary["tagsByPly"];
}

export function MoveList({ moves, locale, selectedPly = null, onSelectPly, tagsByPly }: MoveListProps) {
  const groupedMoves = [];

  for (let index = 0; index < moves.length; index += 2) {
    groupedMoves.push({
      turn: index / 2 + 1,
      white: moves[index],
      black: moves[index + 1],
    });
  }

  if (groupedMoves.length === 0) {
    return (
      <div className="move-list move-list--empty">
        <div className="move-list__empty">
          <span className="move-list__empty-glyph" aria-hidden="true">
            ◫
          </span>
          <strong>{t(locale, "hud.moves")}</strong>
          <p>{t(locale, "section.moves.subtitle.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="move-list">
      <div className="move-list__columns" aria-hidden="true">
        <span className="move-list__column move-list__column--turn">#</span>
        <span className="move-list__column">{t(locale, "hud.side.white")}</span>
        <span className="move-list__column">{t(locale, "hud.side.black")}</span>
      </div>
      {groupedMoves.map((turn) => (
        <div
          className={`move-row ${
            selectedPly === turn.white?.ply || selectedPly === turn.black?.ply ? "is-active" : ""
          }`}
          key={turn.turn}
        >
          <span className="move-row__turn">{turn.turn}.</span>
          <MoveCell
            move={turn.white}
            locale={locale}
            selectedPly={selectedPly}
            onSelectPly={onSelectPly}
            tag={turn.white ? tagsByPly?.[turn.white.ply] : undefined}
          />
          <MoveCell
            move={turn.black}
            locale={locale}
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
  locale: Locale;
  selectedPly: number | null;
  onSelectPly?: (ply: number) => void;
  tag?: AnalysisSummary["tagsByPly"][number];
}

function MoveCell({ move, locale, selectedPly, onSelectPly, tag }: MoveCellProps) {
  if (!move) {
    return <span className="move-cell move-cell--empty" />;
  }

  const selected = selectedPly === move.ply;
  const content = (
    <>
      <span className="move-cell__meta">
        <span className="move-cell__san">{move.san}</span>
        <small className="move-cell__ply">#{move.ply}</small>
      </span>
      {tag ? <small className={`move-tag move-tag--${tag}`}>{t(locale, `analysis.${tag}`)}</small> : null}
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
