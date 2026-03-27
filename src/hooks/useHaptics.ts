import type { FeedbackPreferences, SoundEvent } from "../audio/soundService";

export type HapticEvent = SoundEvent;

export interface HapticPreferences {
  enabled: boolean;
}

class HapticsService {
  private preferences: HapticPreferences = {
    enabled: true,
  };

  private get supportsVibration(): boolean {
    return typeof navigator !== "undefined" && "vibrate" in navigator;
  }

  private vibrate(pattern: number | number[]): boolean {
    if (!this.preferences.enabled || !this.supportsVibration) {
      return false;
    }

    try {
      navigator.vibrate(pattern);
      return true;
    } catch {
      return false;
    }
  }

  play(event: HapticEvent): boolean {
    switch (event) {
      case "piece-select":
        return this.vibrate(10);

      case "selection-blocked":
        return this.vibrate([8, 18, 10]);

      case "piece-move":
        return this.vibrate(25);

      case "piece-capture":
        return this.vibrate([40, 18, 28]);

      case "promotion":
        return this.vibrate([12, 10, 18, 10, 26]);

      case "castle":
        return this.vibrate([18, 16, 22]);

      case "low-time":
        return this.vibrate([18, 28, 18]);

      case "check":
        return this.vibrate([28, 16, 55]);

      case "checkmate":
        return this.vibrate([32, 18, 42, 18, 64]);

      case "game-over":
        return this.vibrate([30, 20, 30, 20, 60]);

      case "undo":
        return this.vibrate([12, 18, 10]);

      case "invalid-move":
        return this.vibrate([14, 16, 22]);
    }
  }

  applyPreferences(preferences: FeedbackPreferences): HapticPreferences {
    if (preferences.hapticsEnabled !== undefined) {
      this.preferences.enabled = preferences.hapticsEnabled;
      if (!preferences.hapticsEnabled && this.supportsVibration) {
        try {
          navigator.vibrate(0);
        } catch {
          // Ignore cancellation failures.
        }
      }
    }

    return this.getPreferences();
  }

  setEnabled(enabled: boolean): void {
    this.applyPreferences({ hapticsEnabled: enabled });
  }

  isEnabled(): boolean {
    return this.preferences.enabled;
  }

  isSupported(): boolean {
    return this.supportsVibration;
  }

  getPreferences(): HapticPreferences {
    return { ...this.preferences };
  }

  select(): boolean {
    return this.play("piece-select");
  }

  blocked(): boolean {
    return this.play("selection-blocked");
  }

  move(): boolean {
    return this.play("piece-move");
  }

  capture(): boolean {
    return this.play("piece-capture");
  }

  promotion(): boolean {
    return this.play("promotion");
  }

  castle(): boolean {
    return this.play("castle");
  }

  lowTime(): boolean {
    return this.play("low-time");
  }

  invalidMove(): boolean {
    return this.play("invalid-move");
  }

  /** 10ms compatibility pulse */
  light(): boolean {
    return this.vibrate(10);
  }

  /** 25ms compatibility pulse */
  medium(): boolean {
    return this.vibrate(25);
  }

  /** capture compatibility pulse */
  heavy(): boolean {
    return this.play("piece-capture");
  }

  check(): boolean {
    return this.play("check");
  }

  checkmate(): boolean {
    return this.play("checkmate");
  }

  gameOver(): boolean {
    return this.play("game-over");
  }

  undo(): boolean {
    return this.play("undo");
  }
}

export const haptics = new HapticsService();
