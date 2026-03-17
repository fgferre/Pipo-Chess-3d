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
        <article>
          <span>{t(locale, "analysis.cpl.white")}</span>
          <strong>{summary.centipawnLossBySide.w}</strong>
        </article>
        <article>
          <span>{t(locale, "analysis.cpl.black")}</span>
          <strong>{summary.centipawnLossBySide.b}</strong>
        </article>
      </div>
      <h3>{t(locale, "analysis.critical")}</h3>
      <div className="analysis-moments">
        {summary.criticalMoments.map((moment) => (
          <article className="analysis-card" key={moment.ply}>
            <span className={`tag tag--${moment.tag}`}>{t(locale, `analysis.${moment.tag}`)}</span>
            <strong>
              {Math.ceil(moment.ply / 2)}.{moment.ply % 2 === 0 ? ".." : ""} {moment.san}
            </strong>
            <span>{moment.swingCp} cp</span>
            <small>{moment.bestLine.join(" ")}</small>
          </article>
        ))}
      </div>
    </div>
  );
}
