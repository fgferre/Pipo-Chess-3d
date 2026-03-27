import type { ReactNode } from "react";
import { formatClock } from "../utils/format";

export interface ClockSideState {
  label: string;
  subtitle: string;
  time: number;
  active: boolean;
  thinking: boolean;
}

export function ClockPill({ side, collapsed }: { side: ClockSideState; collapsed: boolean }) {
  return (
    <article className={`clock-pill ${side.active ? "is-active" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      <div className="clock-pill__dot" aria-hidden="true" />
      <div className="clock-pill__copy">
        {!collapsed ? <span className="clock-pill__eyebrow">{side.subtitle}</span> : null}
        <strong className="clock-pill__time">{formatClock(side.time)}</strong>
        {!collapsed ? (
          <small className={`clock-pill__label ${side.thinking ? "is-thinking" : ""}`}>{side.label}</small>
        ) : null}
      </div>
    </article>
  );
}

export function ActionButton({
  icon,
  label,
  compact,
  labelVisibility = "adaptive",
  disabled,
  loading,
  tone = "default",
  actionId,
  testId,
  onClick,
}: {
  icon: string;
  label: string;
  compact: boolean;
  labelVisibility?: "adaptive" | "always" | "hidden";
  disabled?: boolean;
  loading?: boolean;
  tone?: "default" | "primary" | "secondary";
  actionId?: string;
  testId?: string;
  onClick: () => void;
}) {
  const showLabel = labelVisibility === "always" || (labelVisibility === "adaptive" && !compact);

  return (
    <button
      className={`action-pill action-pill--${tone} ${compact ? "is-compact" : ""} ${loading ? "is-loading" : ""}`}
      aria-label={label}
      data-action-id={actionId}
      data-compact={compact ? "true" : "false"}
      data-label-visibility={labelVisibility}
      data-testid={testId}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <span className="action-pill__icon" aria-hidden="true">
        {loading ? "…" : icon}
      </span>
      {showLabel ? <strong className="action-pill__label">{label}</strong> : null}
    </button>
  );
}

export function MenuSection({
  title,
  subtitle,
  badge,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: "default" | "analysis" | "settings" | "library";
  children: ReactNode;
}) {
  return (
    <section className={`menu-section menu-section--${tone}`}>
      <div className="menu-section__header">
        <div className="menu-section__copy">
          <h2 className="menu-section__title">{title}</h2>
          {subtitle ? <p className="menu-section__subtitle">{subtitle}</p> : null}
        </div>
        {badge ? <span className="menu-section__badge">{badge}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`chip-button ${active ? "is-active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
