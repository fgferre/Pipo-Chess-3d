import type { ReactNode } from "react";

interface PanelSheetProps {
  title: string;
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}

export function PanelSheet({ title, visible, onClose, closeLabel, children }: PanelSheetProps) {
  return (
    <section className={`panel-sheet ${visible ? "is-visible" : ""}`} aria-hidden={!visible}>
      <header className="panel-sheet__header">
        <h2>{title}</h2>
        <button className="ghost-button" type="button" onClick={onClose}>
          {closeLabel}
        </button>
      </header>
      <div className="panel-sheet__body">{children}</div>
    </section>
  );
}
