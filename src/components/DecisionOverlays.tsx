import { useId } from "react";
import { motion } from "framer-motion";

type OverlayMotionMode = "normal" | "reduced" | "off";

interface ReplaceGameDialogProps {
  badge: string;
  body: string;
  cancelLabel: string;
  keepLabel: string;
  motionMode: OverlayMotionMode;
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
  motionMode,
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

  const backdropMotion = getDialogBackdropMotionProps(motionMode);
  const dialogMotion = getDialogCardMotionProps(motionMode);

  return (
    <>
      <motion.div
        className="overlay-scrim overlay-scrim--strong"
        key="replace-scrim"
        aria-hidden="true"
        initial={backdropMotion.initial}
        animate={backdropMotion.animate}
        exit={backdropMotion.exit}
        transition={backdropMotion.transition}
      />
      <motion.section
        className="dialog-card"
        key="replace-dialog"
        initial={dialogMotion.initial}
        animate={dialogMotion.animate}
        exit={dialogMotion.exit}
        transition={dialogMotion.transition}
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
  motionMode: OverlayMotionMode;
  newGameLabel: string;
  open: boolean;
  subtitle: string;
  tone?: "default" | "checkmate";
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
  motionMode,
  newGameLabel,
  open,
  subtitle,
  tone = "default",
  title,
  onOpenAnalysis,
  onOpenMenu,
  onOpenNewGame,
}: ResultModalOverlayProps) {
  const titleId = useId();
  const subtitleId = useId();
  if (!open) {
    return null;
  }

  const [moveMetric, difficultyMetric, clockMetric] = metrics;
  const backdropMotion = getDialogBackdropMotionProps(motionMode);
  const modalMotion = getResultModalMotionProps(motionMode);

  return (
    <>
      <motion.div
        className="overlay-scrim overlay-scrim--strong"
        aria-hidden="true"
        initial={backdropMotion.initial}
        animate={backdropMotion.animate}
        exit={backdropMotion.exit}
        transition={backdropMotion.transition}
      />
      <motion.section
        className="result-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        data-result-tone={tone}
        initial={modalMotion.initial}
        animate={modalMotion.animate}
        exit={modalMotion.exit}
        transition={modalMotion.transition}
      >
        <p className="panel-kicker result-modal__kicker">{kicker}</p>
        <div className="result-modal__hero">
          <span className="result-modal__icon" aria-hidden="true">
            {glyph}
          </span>
          <div className="result-modal__hero-copy">
            <h2 id={titleId}>{title}</h2>
            <p className="muted-copy" id={subtitleId}>{subtitle}</p>
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

function getDialogBackdropMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: motionMode === "reduced" ? 0.12 : 0.22 },
  };
}

function getDialogCardMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, scale: 1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 1, scale: 1 },
      transition: { duration: 0 },
    };
  }

  return motionMode === "reduced"
    ? {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.99 },
        transition: { duration: 0.14, ease: "easeOut" as const },
      }
    : {
        initial: { scale: 0.92, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.95, opacity: 0 },
        transition: { type: "spring" as const, stiffness: 400, damping: 30 },
      };
}

function getResultModalMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, scale: 1, y: 0 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 1, scale: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return motionMode === "reduced"
    ? {
        initial: { opacity: 0, scale: 0.985 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.99 },
        transition: { duration: 0.14, ease: "easeOut" as const },
      }
    : {
        initial: { scale: 0.88, opacity: 0, y: 8 },
        animate: { scale: 1, opacity: 1, y: 0 },
        exit: { scale: 0.92, opacity: 0, y: 6 },
        transition: { type: "spring" as const, stiffness: 400, damping: 30 },
      };
}
