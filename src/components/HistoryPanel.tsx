import { motion } from "framer-motion";
import { MoveList } from "./MoveList";
import { t } from "../i18n";
import type { AnalysisSummary, EnginePhase, GameSession, SerializableMove } from "../types/game";

interface HistoryPanelProps {
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
  onClose: () => void;
  onSelectPly: (ply: number) => void;
}

export function HistoryPanel({
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
  onClose,
  onSelectPly,
}: HistoryPanelProps) {
  return (
    <motion.aside
      className="history-panel"
      initial={{ x: "110%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "110%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      style={{ pointerEvents: "auto" }}
    >
      <div className="history-panel__shell">
        <div className="panel-header panel-header--history">
          <div className="panel-header__cluster">
            <span className="panel-header__glyph" aria-hidden="true">
              ≡
            </span>
            <div>
              <p className="panel-kicker">{t(locale, "history.kicker")}</p>
              <h2>{t(locale, "hud.moves")}</h2>
            </div>
          </div>
          <div className="panel-header__meta">
            <span className="panel-header__badge">{historyBadgeLabel}</span>
            <button
              className="ghost-icon-button"
              type="button"
              aria-label={t(locale, "panel.close")}
              onClick={onClose}
            >
              ×
            </button>
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
    </motion.aside>
  );
}
