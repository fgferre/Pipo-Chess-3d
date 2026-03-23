import type { Locale } from "../types/game";
import type { AnalysisSummary } from "../types/game";
import { t } from "../i18n";

interface AnalysisSummaryViewProps {
  summary?: AnalysisSummary;
  locale: Locale;
}

export function AnalysisSummaryView({ summary, locale }: AnalysisSummaryViewProps) {
  if (!summary) {
    return <p className="muted-copy">{t(locale, "panel.analysis.empty")}</p>;
  }

  return (
    <div className="analysis-view">
      <div className="analysis-cpl">
        <article className="analysis-cpl__card">
          <div className="analysis-cpl__header">
            <span className="analysis-cpl__well" aria-hidden="true">
              W
            </span>
            <div className="analysis-cpl__copy">
              <span className="analysis-cpl__label">{t(locale, "analysis.cpl.white")}</span>
              <small className="analysis-cpl__tone">{t(locale, "hud.side.white")}</small>
            </div>
          </div>
          <strong className="analysis-cpl__value">{summary.centipawnLossBySide.w}</strong>
        </article>
        <article className="analysis-cpl__card">
          <div className="analysis-cpl__header">
            <span className="analysis-cpl__well" aria-hidden="true">
              B
            </span>
            <div className="analysis-cpl__copy">
              <span className="analysis-cpl__label">{t(locale, "analysis.cpl.black")}</span>
              <small className="analysis-cpl__tone">{t(locale, "hud.side.black")}</small>
            </div>
          </div>
          <strong className="analysis-cpl__value">{summary.centipawnLossBySide.b}</strong>
        </article>
      </div>
      <section className="analysis-section">
        <div className="analysis-section__header">
          <h3>{t(locale, "analysis.critical")}</h3>
          <span className="analysis-section__count">{summary.criticalMoments.length}</span>
        </div>
        <div className="analysis-moments">
          {summary.criticalMoments.map((moment) => (
            <article className="analysis-card" key={moment.ply}>
              <div className="analysis-card__meta">
                <div className="analysis-card__tagline">
                  <span className={`tag tag--${moment.tag}`}>{t(locale, `analysis.${moment.tag}`)}</span>
                  <small className="analysis-card__ply">
                    {Math.ceil(moment.ply / 2)}.{moment.ply % 2 === 0 ? ".." : ""}
                  </small>
                </div>
                <span className="analysis-card__swing">{moment.swingCp} cp</span>
              </div>
              <strong className="analysis-card__move">{moment.san}</strong>
              <small className="analysis-card__line">{moment.bestLine.join(" ")}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
