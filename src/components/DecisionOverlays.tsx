import { motion } from "framer-motion";

interface ReplaceGameDialogProps {
  badge: string;
  body: string;
  cancelLabel: string;
  keepLabel: string;
  open: boolean;
  replaceLabel: string;
  title: string;
  onCancel: () => void;
  onKeep: () => void;
  onReplace: () => void;
}

export function ReplaceGameDialog({
  badge,
  body,
  cancelLabel,
  keepLabel,
  open,
  replaceLabel,
  title,
  onCancel,
  onKeep,
  onReplace,
}: ReplaceGameDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <>
      <motion.div
        className="overlay-scrim overlay-scrim--strong"
        key="replace-scrim"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />
      <motion.section
        className="dialog-card"
        key="replace-dialog"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <span className="dialog-card__badge">{badge}</span>
        <div className="dialog-card__icon" aria-hidden="true">
          ↺
        </div>
        <div className="dialog-card__copy">
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="inline-actions inline-actions--dialog">
          <button className="ghost-button decision-button" data-icon="↺" type="button" onClick={onKeep}>
            {keepLabel}
          </button>
          <button className="ghost-button decision-button" data-icon="−" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="primary-button decision-button" data-icon="✦" type="button" onClick={onReplace}>
            {replaceLabel}
          </button>
        </div>
      </motion.section>
    </>
  );
}

interface ResultModalOverlayProps {
  analysisLabel: string;
  glyph: string;
  kicker: string;
  menuLabel: string;
  metrics: Array<{ label: string; value: string | number }>;
  newGameLabel: string;
  open: boolean;
  subtitle: string;
  title: string;
  onOpenAnalysis: () => void;
  onOpenMenu: () => void;
  onOpenNewGame: () => void;
}

export function ResultModalOverlay({
  analysisLabel,
  glyph,
  kicker,
  menuLabel,
  metrics,
  newGameLabel,
  open,
  subtitle,
  title,
  onOpenAnalysis,
  onOpenMenu,
  onOpenNewGame,
}: ResultModalOverlayProps) {
  if (!open) {
    return null;
  }

  const [moveMetric, difficultyMetric, clockMetric] = metrics;

  return (
    <>
      <motion.div
        className="overlay-scrim overlay-scrim--strong"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
      />
      <motion.section
        className="result-modal"
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <p className="panel-kicker result-modal__kicker">{kicker}</p>
        <div className="result-modal__hero">
          <span className="result-modal__icon" aria-hidden="true">
            {glyph}
          </span>
          <div className="result-modal__hero-copy">
            <h2>{title}</h2>
            <p className="muted-copy">{subtitle}</p>
          </div>
        </div>
        <div className="result-modal__stage" aria-hidden="true">
          <span className="result-modal__stage-glyph">{glyph}</span>
        </div>
        <div className="result-modal__metrics">
          <article className="result-metric">
            <span>{moveMetric.label}</span>
            <strong>{moveMetric.value}</strong>
          </article>
          <article className="result-metric">
            <span>{difficultyMetric.label}</span>
            <strong>{difficultyMetric.value}</strong>
          </article>
          <article className="result-metric">
            <span>{clockMetric.label}</span>
            <strong>{clockMetric.value}</strong>
          </article>
        </div>
        <div className="inline-actions inline-actions--result">
          <button className="primary-button decision-button" data-icon="∿" type="button" onClick={onOpenAnalysis}>
            {analysisLabel}
          </button>
          <button className="ghost-button decision-button" data-icon="+" type="button" onClick={onOpenNewGame}>
            {newGameLabel}
          </button>
          <button className="ghost-button decision-button" data-icon="☰" type="button" onClick={onOpenMenu}>
            {menuLabel}
          </button>
        </div>
      </motion.section>
    </>
  );
}
