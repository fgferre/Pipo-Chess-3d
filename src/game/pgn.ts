import { Chess } from "chess.js";
import { getDifficultyPreset } from "../data/difficulties";
import type { AppSettings, ClockConfig } from "../types/game";

const VERSION = "0.1.0";

export function applyPipoHeaders(chess: Chess, settings: AppSettings): void {
  const difficulty = getDifficultyPreset(settings.difficultyId);
  const today = new Date().toISOString().slice(0, 10);
  const clock = settings.clockConfig;

  chess.setHeader("Event", "Pipo Chess 3D");
  chess.setHeader("Site", "Browser");
  chess.setHeader("Date", today);
  chess.setHeader("White", "Player");
  chess.setHeader("Black", `Stockfish ${difficulty.label}`);
  chess.setHeader("Result", inferPgnResult(chess));
  chess.setHeader("PipoDifficulty", settings.difficultyId);
  chess.setHeader("PipoTheme", settings.themeId);
  chess.setHeader("PipoLocale", settings.locale);
  chess.setHeader("PipoOrientation", settings.orientation);
  chess.setHeader("PipoClockEnabled", String(clock.enabled));
  chess.setHeader("PipoClockLabel", clock.label);
  chess.setHeader("PipoClockBaseMs", String(clock.baseMs));
  chess.setHeader("PipoClockIncrementMs", String(clock.incrementMs));
  chess.setHeader("PipoVersion", VERSION);
}

export function buildPgn(chess: Chess, settings: AppSettings): string {
  applyPipoHeaders(chess, settings);
  return chess.pgn({ newline: "\n", maxWidth: 100 });
}

export function extractSettingsFromHeaders(
  headers: Record<string, string>,
  fallback: AppSettings,
): AppSettings {
  const baseMs = Number(headers.PipoClockBaseMs);
  const incrementMs = Number(headers.PipoClockIncrementMs);
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
    ...fallback,
    difficultyId: headers.PipoDifficulty || fallback.difficultyId,
    themeId: headers.PipoTheme || fallback.themeId,
    locale: headers.PipoLocale === "en" ? "en" : fallback.locale,
    orientation: headers.PipoOrientation === "black" ? "black" : fallback.orientation,
    clockConfig,
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
