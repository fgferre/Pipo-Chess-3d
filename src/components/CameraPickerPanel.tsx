import { motion, type Transition } from "framer-motion";
import type { CameraPreset } from "../types/game";

export type CameraPickerPresentation = "desktop-popover" | "mobile-sheet";

export interface CameraPresetOption {
  id: CameraPreset;
  icon: string;
  label: string;
}

export interface CameraPickerPanelProps {
  cameraPreset: CameraPreset;
  presentation?: CameraPickerPresentation;
  presets: CameraPresetOption[];
  title: string;
  kicker: string;
  onSelectPreset: (preset: CameraPreset) => void;
  panelId?: string;
  rootTestId?: string;
  gridTestId?: string;
}

export function CameraPickerPanel({
  cameraPreset,
  presentation = "desktop-popover",
  presets,
  title,
  kicker,
  onSelectPreset,
  panelId = "camera-picker-panel",
  rootTestId = "camera-picker-panel",
  gridTestId = "camera-picker-grid",
}: CameraPickerPanelProps) {
  const headingId = `${panelId}-title`;
  const kickerId = `${panelId}-kicker`;
  const isMobileSheet = presentation === "mobile-sheet";
  const surfaceType = presentation === "mobile-sheet" ? "sheet" : "popover";
  const surfacePlacement = presentation === "mobile-sheet" ? "bottom" : "floating";
  const initial = isMobileSheet ? { y: "110%", opacity: 0 } : { x: 24, opacity: 0, scale: 0.98 };
  const animate = isMobileSheet ? { y: 0, opacity: 1 } : { x: 0, opacity: 1, scale: 1 };
  const exit = isMobileSheet ? { y: "110%", opacity: 0 } : { x: 24, opacity: 0, scale: 0.98 };
  const transition: Transition = isMobileSheet
    ? { type: "spring", stiffness: 320, damping: 36 }
    : { type: "spring", stiffness: 360, damping: 34 };

  return (
    <motion.section
      className={`camera-picker camera-picker--${presentation}`}
      id={panelId}
      role="region"
      aria-labelledby={headingId}
      aria-describedby={kickerId}
      tabIndex={-1}
      data-panel="camera-picker"
      data-presentation={presentation}
      data-surface={surfaceType}
      data-surface-placement={surfacePlacement}
      data-testid={rootTestId}
      initial={initial}
      animate={animate}
      exit={exit}
      transition={transition}
      style={{ pointerEvents: "auto" }}
    >
      <div className="panel-header">
        <div>
          <p className="panel-kicker" id={kickerId}>
            {kicker}
          </p>
          <h2 id={headingId}>{title}</h2>
        </div>
      </div>
      <div
        className="camera-grid"
        role="group"
        aria-labelledby={headingId}
        data-panel-grid="camera-picker"
        data-presentation={presentation}
        data-testid={gridTestId}
      >
        {presets.map((preset) => (
          <button
            className={`camera-card ${cameraPreset === preset.id ? "is-selected" : ""}`}
            key={preset.id}
            type="button"
            aria-pressed={cameraPreset === preset.id}
            data-camera-preset={preset.id}
            data-selected={cameraPreset === preset.id ? "true" : "false"}
            data-testid={`camera-preset-${preset.id}`}
            onClick={() => onSelectPreset(preset.id)}
          >
            <span className="camera-card__well" aria-hidden="true">
              <span className="camera-card__symbol">{preset.icon}</span>
            </span>
            <strong>{preset.label}</strong>
          </button>
        ))}
      </div>
    </motion.section>
  );
}
