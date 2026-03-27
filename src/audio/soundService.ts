export type SoundEvent =
  | "piece-select"
  | "selection-blocked"
  | "piece-move"
  | "piece-capture"
  | "promotion"
  | "castle"
  | "low-time"
  | "check"
  | "checkmate"
  | "game-over"
  | "undo"
  | "invalid-move";

export interface FeedbackPreferences {
  soundEnabled?: boolean;
  soundVolume?: number;
  hapticsEnabled?: boolean;
}

export interface SoundPreferences {
  enabled: boolean;
  volume: number;
}

class SoundService {
  private ctx: AudioContext | null = null;
  private preferences: SoundPreferences = {
    enabled: true,
    volume: 0.72,
  };

  private canPlay(): boolean {
    return this.preferences.enabled && this.preferences.volume > 0;
  }

  private getCtx(): AudioContext | null {
    if (!this.canPlay()) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    // AudioContext may be suspended until user interaction
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private syncContextState(): void {
    if (!this.ctx || this.canPlay() || this.ctx.state !== "running") {
      return;
    }

    void this.ctx.suspend().catch(() => undefined);
  }

  private gain(ctx: AudioContext): GainNode {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    return g;
  }

  private clampVolume(volume: number): number {
    if (!Number.isFinite(volume)) {
      return this.preferences.volume;
    }

    return Math.max(0, Math.min(1, volume));
  }

  private scheduleEnvelope(
    gainNode: GainNode,
    startTime: number,
    durationSec: number,
    peakGain: number,
  ): void {
    const actualPeak = peakGain * this.preferences.volume;
    if (actualPeak <= 0.0001) {
      return;
    }

    const attackSec = Math.min(durationSec * 0.25, 0.012);
    const attackTime = startTime + attackSec;
    const endTime = startTime + durationSec;

    gainNode.gain.cancelScheduledValues(startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(actualPeak, attackTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
  }

  private tone(
    ctx: AudioContext,
    {
      fromFreq,
      toFreq,
      durationSec,
      gainValue,
      delayMs = 0,
      waveform = "sine",
    }: {
      fromFreq: number;
      toFreq?: number;
      durationSec: number;
      gainValue: number;
      delayMs?: number;
      waveform?: OscillatorType;
    },
  ): void {
    const startTime = ctx.currentTime + delayMs / 1000;
    const endTime = startTime + durationSec;
    const osc = ctx.createOscillator();
    const g = this.gain(ctx);

    osc.type = waveform;
    osc.frequency.setValueAtTime(fromFreq, startTime);
    if (toFreq !== undefined && toFreq !== fromFreq) {
      osc.frequency.exponentialRampToValueAtTime(toFreq, startTime + durationSec * 0.7);
    }

    this.scheduleEnvelope(g, startTime, durationSec, gainValue);

    osc.connect(g);
    osc.start(startTime);
    osc.stop(endTime);
  }

  private noise(
    ctx: AudioContext,
    durationSec: number,
    gainValue: number,
    delayMs = 0,
    centerFreq = 900,
    q = 1.2,
  ): void {
    const bufferSize = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = centerFreq;
    filter.Q.value = q;

    const g = this.gain(ctx);
    const startTime = ctx.currentTime + delayMs / 1000;
    source.connect(filter);
    filter.connect(g);
    this.scheduleEnvelope(g, startTime, durationSec, gainValue);
    source.start(startTime);
    source.stop(startTime + durationSec);
  }

  play(event: SoundEvent): boolean {
    const ctx = this.getCtx();
    if (!ctx) return false;

    switch (event) {
      case "piece-select":
        this.tone(ctx, { fromFreq: 1100, toFreq: 900, durationSec: 0.022, gainValue: 0.28 });
        break;

      case "selection-blocked":
        this.tone(ctx, {
          fromFreq: 460,
          toFreq: 290,
          durationSec: 0.03,
          gainValue: 0.15,
          waveform: "triangle",
        });
        this.tone(ctx, {
          fromFreq: 390,
          toFreq: 250,
          durationSec: 0.026,
          gainValue: 0.12,
          delayMs: 42,
          waveform: "triangle",
        });
        break;

      case "piece-move":
        this.tone(ctx, { fromFreq: 780, toFreq: 560, durationSec: 0.065, gainValue: 0.55 });
        break;

      case "piece-capture":
        this.tone(ctx, { fromFreq: 650, toFreq: 380, durationSec: 0.08, gainValue: 0.65 });
        this.noise(ctx, 0.07, 0.22);
        break;

      case "promotion":
        this.tone(ctx, { fromFreq: 720, toFreq: 860, durationSec: 0.055, gainValue: 0.24 });
        this.tone(ctx, {
          fromFreq: 980,
          toFreq: 1160,
          durationSec: 0.07,
          gainValue: 0.18,
          delayMs: 60,
        });
        this.tone(ctx, {
          fromFreq: 1320,
          toFreq: 1540,
          durationSec: 0.09,
          gainValue: 0.14,
          delayMs: 120,
        });
        break;

      case "castle":
        this.tone(ctx, { fromFreq: 780, toFreq: 560, durationSec: 0.065, gainValue: 0.45 });
        this.tone(ctx, {
          fromFreq: 680,
          toFreq: 480,
          durationSec: 0.065,
          gainValue: 0.38,
          delayMs: 90,
        });
        break;

      case "low-time":
        this.tone(ctx, { fromFreq: 1180, toFreq: 980, durationSec: 0.042, gainValue: 0.22 });
        this.tone(ctx, {
          fromFreq: 1180,
          toFreq: 980,
          durationSec: 0.042,
          gainValue: 0.19,
          delayMs: 110,
        });
        break;

      case "check":
        this.tone(ctx, { fromFreq: 520, toFreq: 495, durationSec: 0.18, gainValue: 0.34 });
        this.tone(ctx, { fromFreq: 660, toFreq: 630, durationSec: 0.18, gainValue: 0.24 });
        break;

      case "checkmate":
        this.tone(ctx, { fromFreq: 760, toFreq: 720, durationSec: 0.08, gainValue: 0.25 });
        this.tone(ctx, {
          fromFreq: 520,
          toFreq: 430,
          durationSec: 0.15,
          gainValue: 0.32,
          delayMs: 90,
        });
        this.tone(ctx, {
          fromFreq: 330,
          toFreq: 220,
          durationSec: 0.28,
          gainValue: 0.42,
          delayMs: 220,
          waveform: "triangle",
        });
        break;

      case "game-over":
        this.tone(ctx, { fromFreq: 880, toFreq: 840, durationSec: 0.12, gainValue: 0.34 });
        this.tone(ctx, {
          fromFreq: 660,
          toFreq: 610,
          durationSec: 0.14,
          gainValue: 0.28,
          delayMs: 120,
        });
        this.tone(ctx, {
          fromFreq: 520,
          toFreq: 460,
          durationSec: 0.18,
          gainValue: 0.26,
          delayMs: 250,
        });
        break;

      case "undo":
        this.tone(ctx, { fromFreq: 380, toFreq: 680, durationSec: 0.065, gainValue: 0.4 });
        this.tone(ctx, {
          fromFreq: 480,
          toFreq: 780,
          durationSec: 0.045,
          gainValue: 0.3,
          delayMs: 60,
        });
        break;

      case "invalid-move":
        this.tone(ctx, {
          fromFreq: 280,
          toFreq: 180,
          durationSec: 0.06,
          gainValue: 0.25,
          waveform: "triangle",
        });
        this.tone(ctx, {
          fromFreq: 220,
          toFreq: 150,
          durationSec: 0.04,
          gainValue: 0.12,
          delayMs: 16,
          waveform: "triangle",
        });
        break;
    }

    return true;
  }

  applyPreferences(preferences: FeedbackPreferences): SoundPreferences {
    if (preferences.soundEnabled !== undefined) {
      this.preferences.enabled = preferences.soundEnabled;
    }

    if (preferences.soundVolume !== undefined) {
      this.preferences.volume = this.clampVolume(preferences.soundVolume);
    }

    this.syncContextState();
    return this.getPreferences();
  }

  setEnabled(enabled: boolean): void {
    this.applyPreferences({ soundEnabled: enabled });
  }

  setVolume(volume: number): void {
    this.applyPreferences({ soundVolume: volume });
  }

  isEnabled(): boolean {
    return this.preferences.enabled;
  }

  getVolume(): number {
    return this.preferences.volume;
  }

  getPreferences(): SoundPreferences {
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

  invalidMove(): boolean {
    return this.play("invalid-move");
  }
}

export const soundService = new SoundService();
