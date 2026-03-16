import { Chess, type Color } from "chess.js";
import { getDifficultyPreset } from "../data/difficulties";
import type { AppSettings, ClockConfig } from "../types/game";

const VERSION = "0.1.0";

export function applyPipoHeaders(
  chess: Chess,
  settings: AppSettings,
  playerColor: Color = "w",
): void {
  const difficulty = getDifficultyPreset(settings.difficultyId);
  const today = new Date().toISOString().slice(0, 10);
  const clock = settings.clockConfig;
  const playerLabel = playerColor === "w" ? "Player" : `Stockfish ${difficulty.label}`;
  const engineLabel = playerColor === "b" ? "Player" : `Stockfish ${difficulty.label}`;

  chess.setHeader("Event", "Pipo Chess 3D");
  chess.setHeader("Site", "Browser");
  chess.setHeader("Date", today);
  chess.setHeader("White", playerLabel);
  chess.setHeader("Black", engineLabel);
  chess.setHeader("Result", inferPgnResult(chess));
  chess.setHeader("PipoDifficulty", settings.difficultyId);
  chess.setHeader("PipoTheme", settings.themeId);
  chess.setHeader("PipoLocale", settings.locale);
  chess.setHeader("PipoOrientation", settings.orientation);
  chess.setHeader("PipoAnimationMode", settings.animationMode);
  chess.setHeader("PipoDefaultViewMode", settings.defaultViewMode);
  chess.setHeader("PipoCameraRotateSensitivity", String(settings.cameraSensitivity.rotate));
  chess.setHeader("PipoCameraZoomSensitivity", String(settings.cameraSensitivity.zoom));
  chess.setHeader("PipoPlayerColor", playerColor);
  chess.setHeader("PipoClockEnabled", String(clock.enabled));
  chess.setHeader("PipoClockLabel", clock.label);
  chess.setHeader("PipoClockBaseMs", String(clock.baseMs));
  chess.setHeader("PipoClockIncrementMs", String(clock.incrementMs));
  chess.setHeader("PipoVersion", VERSION);
}

export function buildPgn(chess: Chess, settings: AppSettings, playerColor: Color = "w"): string {
  applyPipoHeaders(chess, settings, playerColor);
  return chess.pgn({ newline: "\n", maxWidth: 100 });
}

export function extractSettingsFromHeaders(
  headers: Record<string, string>,
  fallback: AppSettings,
): { settings: AppSettings; playerColor: Color } {
  const baseMs = Number(headers.PipoClockBaseMs);
  const incrementMs = Number(headers.PipoClockIncrementMs);
  const rotateSensitivity = Number(headers.PipoCameraRotateSensitivity);
  const zoomSensitivity = Number(headers.PipoCameraZoomSensitivity);
  const enabled =
    headers.PipoClockEnabled === undefined
      ? fallback.clockConfig.enabled
      : headers.PipoClockEnabled === "true";

  const clockConfig: ClockConfig = {
    enabled,
    label: headers.PipoClockLabel || fallback.clockConfig.label,
    baseMs: Number.isFinite(baseMs) ? baseMs : fallback.clockConfig.baseMs,
    incrementMs: Number.isFinite(incrementMs) ? incrementMs : fallback.clockConfig.incrementMs,
  };

  return {
    settings: {
      ...fallback,
      difficultyId: headers.PipoDifficulty || fallback.difficultyId,
      themeId: headers.PipoTheme || fallback.themeId,
      locale: headers.PipoLocale === "en" ? "en" : fallback.locale,
      orientation: headers.PipoOrientation === "black" ? "black" : fallback.orientation,
      animationMode:
        headers.PipoAnimationMode === "reduced" || headers.PipoAnimationMode === "off"
          ? headers.PipoAnimationMode
          : fallback.animationMode,
      defaultViewMode: headers.PipoDefaultViewMode === "2d" ? "2d" : fallback.defaultViewMode,
      cameraSensitivity: {
        rotate: Number.isFinite(rotateSensitivity) ? rotateSensitivity : fallback.cameraSensitivity.rotate,
        zoom: Number.isFinite(zoomSensitivity) ? zoomSensitivity : fallback.cameraSensitivity.zoom,
      },
      clockConfig,
    },
    playerColor: headers.PipoPlayerColor === "b" ? "b" : "w",
  };
}

export function inferPgnResult(chess: Chess): string {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "0-1" : "1-0";
  }

  if (chess.isDraw()) {
    return "1/2-1/2";
  }

  return "*";
}
