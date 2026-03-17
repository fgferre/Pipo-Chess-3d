export type SoundEvent =
  | "piece-select"
  | "piece-move"
  | "piece-capture"
  | "castle"
  | "check"
  | "game-over";

class SoundService {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private volume = 0.72;

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    // AudioContext may be suspended until user interaction
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private gain(ctx: AudioContext, value: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = value * this.volume;
    g.connect(ctx.destination);
    return g;
  }

  // Short percussive click via oscillator sweep
  private click(
    ctx: AudioContext,
    freq1: number,
    freq2: number,
    durationSec: number,
    gainValue: number,
    delayMs = 0,
  ): void {
    const startTime = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const g = this.gain(ctx, gainValue);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq1, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq2, startTime + durationSec * 0.6);

    g.gain.setValueAtTime(gainValue * this.volume, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    osc.connect(g);
    osc.start(startTime);
    osc.stop(startTime + durationSec);
  }

  // White noise burst for captures
  private noise(ctx: AudioContext, durationSec: number, gainValue: number): void {
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
    filter.frequency.value = 900;
    filter.Q.value = 1.2;

    const g = this.gain(ctx, gainValue);
    source.connect(filter);
    filter.connect(g);
    source.start(ctx.currentTime);
  }

  play(event: SoundEvent): void {
    const ctx = this.getCtx();
    if (!ctx) return;

    switch (event) {
      case "piece-select":
        // Soft click: 1100 → 900 Hz, 22ms
        this.click(ctx, 1100, 900, 0.022, 0.28);
        break;

      case "piece-move":
        // Woody thud: 780 → 560 Hz, 65ms
        this.click(ctx, 780, 560, 0.065, 0.55);
        break;

      case "piece-capture":
        // Hard strike + noise burst
        this.click(ctx, 650, 380, 0.08, 0.65);
        this.noise(ctx, 0.07, 0.22);
        break;

      case "castle":
        // Two clicks in sequence
        this.click(ctx, 780, 560, 0.065, 0.45);
        this.click(ctx, 680, 480, 0.065, 0.38, 90);
        break;

      case "check":
        // Tense chord: two oscillators
        this.click(ctx, 520, 490, 0.22, 0.38);
        this.click(ctx, 660, 620, 0.22, 0.28);
        break;

      case "game-over":
        // Descending arpeggio
        this.click(ctx, 880, 840, 0.14, 0.42);
        this.click(ctx, 660, 620, 0.16, 0.38, 140);
        this.click(ctx, 440, 400, 0.24, 0.45, 290);
        break;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.ctx) {
      void this.ctx.suspend();
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const soundService = new SoundService();
