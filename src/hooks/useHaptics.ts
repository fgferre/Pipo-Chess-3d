const supportsVibration = typeof navigator !== "undefined" && "vibrate" in navigator;

function vibrate(pattern: number | number[]): void {
  if (!supportsVibration) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore — some browsers restrict vibration
  }
}

export const haptics = {
  /** 10ms — piece selection */
  light(): void {
    vibrate(10);
  },
  /** 25ms — move confirmed */
  medium(): void {
    vibrate(25);
  },
  /** double pulse — capture */
  heavy(): void {
    vibrate([40, 18, 28]);
  },
  /** three pulses — check */
  check(): void {
    vibrate([28, 16, 55]);
  },
  /** game over */
  gameOver(): void {
    vibrate([30, 20, 30, 20, 60]);
  },
};
