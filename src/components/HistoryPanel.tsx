import { MoveList } from "./MoveList";
import { t } from "../i18n";
import type { AnalysisSummary, EnginePhase, GameSession, SerializableMove } from "../types/game";

interface HistoryPanelProps {
  open: boolean;
  hidden?: boolean;
  historyBadgeLabel: string;
  historyProgress: number;
  historySessionSubtitle: string;
  historySummary: string;
  locale: GameSession["settings"]["locale"];
  moveCount: number;
  moves: SerializableMove[];
  engineLabel: string;
  selectedPly: number | null;
  sessionStatusLabel: string;
  sessionStatusTone: "analyzing" | EnginePhase;
  tagsByPly?: AnalysisSummary["tagsByPly"];
  onToggle: () => void;
  onSelectPly: (ply: number) => void;
  shellPointerEvents?: "auto" | "none";
}

export function HistoryPanel({
  open,
  hidden = false,
  engineLabel,
  historyBadgeLabel,
  historyProgress,
  historySessionSubtitle,
  historySummary,
  locale,
  moveCount,
  moves,
  selectedPly,
  sessionStatusLabel,
  sessionStatusTone,
  tagsByPly,
  onToggle,
  onSelectPly,
  shellPointerEvents = "auto",
}: HistoryPanelProps) {
  return (
    <aside
      className={`history-panel${open ? " is-open" : ""}${hidden ? " is-hidden" : ""}`}
      data-state={open ? "open" : "closed"}
      aria-hidden={hidden ? "true" : undefined}
    >
      <button
        className="history-tab"
        type="button"
        aria-label={open ? t(locale, "panel.close") : t(locale, "history.toggle")}
        aria-expanded={open}
        aria-controls="history-panel-shell"
        onClick={onToggle}
      >
        <span className="history-tab__icon" aria-hidden="true">
          ◫
        </span>
        <span className="history-tab__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="history-tab__label">{historyBadgeLabel}</span>
      </button>
      <div
        className="history-panel__shell"
        id="history-panel-shell"
        aria-hidden={!open}
        style={{ pointerEvents: open && !hidden ? shellPointerEvents : "none" }}
        {...(!open || hidden ? ({ inert: "" } as any) : {})}
      >
        <div className="panel-header panel-header--history">
          <div className="panel-header__cluster">
            <div>
              <p className="panel-kicker">{t(locale, "history.kicker")}</p>
              <h2>{t(locale, "hud.moves")}</h2>
            </div>
          </div>
          <div className="panel-header__meta">
            <span className="panel-header__badge">{historyBadgeLabel}</span>
          </div>
        </div>
        <section className="history-panel__session">
          <div className="history-panel__session-indicator" aria-hidden="true" />
          <div className="history-panel__session-copy">
            <strong>{t(locale, "section.game.title")}</strong>
            <small>{historySessionSubtitle}</small>
          </div>
          <span className={`status-pill status-pill--${sessionStatusTone}`}>{sessionStatusLabel}</span>
        </section>
        <div className="history-panel__body">
          <MoveList
            moves={moves}
            locale={locale}
            selectedPly={selectedPly}
            onSelectPly={onSelectPly}
            tagsByPly={tagsByPly}
          />
        </div>
        <footer className="history-panel__footer">
          <div className="history-panel__metrics">
            <article className="history-panel__metric">
              <span>{t(locale, "hud.moves")}</span>
              <strong>{moveCount}</strong>
            </article>
            <article className="history-panel__metric">
              <span>{t(locale, "hud.engine")}</span>
              <strong>{engineLabel}</strong>
            </article>
          </div>
          <div aria-hidden="true" className="history-panel__progress">
            <span className="history-panel__progress-fill" style={{ width: `${historyProgress}%` }} />
          </div>
          <p className="history-panel__summary">{historySummary}</p>
        </footer>
      </div>
    </aside>
  );
}
