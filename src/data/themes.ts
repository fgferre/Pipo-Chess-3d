import type { ThemeDefinition } from "../types/game";

export const themes: ThemeDefinition[] = [
  {
    id: "classic-wood",
    label: "Classic Wood",
    boardLight: "#dcbf95",
    boardDark: "#6f4d38",
    boardFrame: "#2b1f1a",
    whitePiece: "#f1ead8",
    blackPiece: "#1b1d22",
    highlightPrimary: "#f6c344",
    highlightSecondary: "#3cc7ab",
    hudBackground: "rgba(9, 20, 34, 0.78)",
    hudBorder: "rgba(255, 214, 153, 0.18)",
    textPrimary: "#f8f0de",
    textMuted: "rgba(248, 240, 222, 0.72)",
    backdrop:
      "radial-gradient(circle at top, rgba(244,189,103,0.22), transparent 32%), linear-gradient(180deg, #0d1522 0%, #15273b 44%, #0b1320 100%)",
    backdropGlow: "rgba(244, 189, 103, 0.2)",
  },
  {
    id: "emerald",
    label: "Emerald",
    boardLight: "#bdd9b6",
    boardDark: "#315f4d",
    boardFrame: "#10221d",
    whitePiece: "#f1faef",
    blackPiece: "#0f1716",
    highlightPrimary: "#b7ff65",
    highlightSecondary: "#60f2cf",
    hudBackground: "rgba(7, 27, 27, 0.82)",
    hudBorder: "rgba(183, 255, 101, 0.18)",
    textPrimary: "#e8f7ee",
    textMuted: "rgba(232, 247, 238, 0.72)",
    backdrop:
      "radial-gradient(circle at top right, rgba(96,242,207,0.22), transparent 32%), linear-gradient(180deg, #05181d 0%, #0b352d 52%, #061116 100%)",
    backdropGlow: "rgba(96, 242, 207, 0.18)",
  },
  {
    id: "slate",
    label: "Slate",
    boardLight: "#dce1e8",
    boardDark: "#4d596e",
    boardFrame: "#151b26",
    whitePiece: "#f5f7fa",
    blackPiece: "#1b212d",
    highlightPrimary: "#ff8575",
    highlightSecondary: "#6fd5ff",
    hudBackground: "rgba(9, 14, 23, 0.82)",
    hudBorder: "rgba(111, 213, 255, 0.18)",
    textPrimary: "#f4f7fb",
    textMuted: "rgba(244, 247, 251, 0.72)",
    backdrop:
      "radial-gradient(circle at top left, rgba(111,213,255,0.16), transparent 34%), linear-gradient(180deg, #09111d 0%, #172233 48%, #090f19 100%)",
    backdropGlow: "rgba(111, 213, 255, 0.18)",
  },
];

export const defaultThemeId = "classic-wood";

export function getTheme(id: string): ThemeDefinition {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}

export function getThemeCssVariables(theme: ThemeDefinition): Record<string, string> {
  return {
    "--app-backdrop": theme.backdrop,
    "--app-glow": theme.backdropGlow,
    "--hud-surface": theme.hudBackground,
    "--hud-border": theme.hudBorder,
    "--text-primary": theme.textPrimary,
    "--text-muted": theme.textMuted,
    "--accent-primary": theme.highlightPrimary,
    "--accent-secondary": theme.highlightSecondary,
  };
}

