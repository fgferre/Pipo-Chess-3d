import { motion } from "framer-motion";
import type { CameraPreset } from "../types/game";

interface CameraPresetOption {
  id: CameraPreset;
  icon: string;
  label: string;
}

interface CameraPickerPanelProps {
  cameraPreset: CameraPreset;
  presets: CameraPresetOption[];
  title: string;
  kicker: string;
  onSelectPreset: (preset: CameraPreset) => void;
}

export function CameraPickerPanel({
  cameraPreset,
  presets,
  title,
  kicker,
  onSelectPreset,
}: CameraPickerPanelProps) {
  return (
    <motion.section
      className="camera-picker"
      initial={{ x: "110%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "110%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 36 }}
      style={{ pointerEvents: "auto" }}
    >
      <div className="panel-header">
        <div>
          <p className="panel-kicker">{kicker}</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="camera-grid">
        {presets.map((preset) => (
          <button
            className={`camera-card ${cameraPreset === preset.id ? "is-selected" : ""}`}
            key={preset.id}
            type="button"
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
