import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockOscillator = {
  type: OscillatorType;
  frequency: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type MockGainNode = {
  gain: {
    value: number;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
};

type MockBufferSource = {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function installAudioContextMock(state: "running" | "suspended" = "running", currentTime = 1.5) {
  const oscillators: MockOscillator[] = [];
  const gainNodes: MockGainNode[] = [];
  const bufferSources: MockBufferSource[] = [];
  const filters: Array<{
    type: BiquadFilterType;
    frequency: { value: number };
    Q: { value: number };
    connect: ReturnType<typeof vi.fn>;
  }> = [];

  const context = {
    state,
    currentTime,
    sampleRate: 48_000,
    destination: {},
    createGain: vi.fn(() => {
      const node: MockGainNode = {
        gain: {
          value: 0,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      gainNodes.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node: MockOscillator = {
        type: "sine",
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(node);
      return node;
    }),
    createBuffer: vi.fn((channels: number, length: number, sampleRateArg: number) => ({
      channels,
      length,
      sampleRate: sampleRateArg,
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    createBufferSource: vi.fn(() => {
      const node: MockBufferSource = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() => {
      const node = {
        type: "bandpass" as BiquadFilterType,
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      };
      filters.push(node);
      return node;
    }),
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;

  const AudioContextCtor = function AudioContextMock(this: unknown) {
    return context;
  };
  const AudioContextMock = vi.fn(AudioContextCtor);
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    value: AudioContextMock,
  });
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: AudioContextMock,
  });

  return { AudioContextMock, context, oscillators, gainNodes, bufferSources, filters };
}

describe("soundService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "AudioContext");
    Reflect.deleteProperty(globalThis, "AudioContext");
  });

  it.each([
    ["piece-select", 1, 0, 0.022, 1100, 900, null],
    ["piece-move", 1, 0, 0.065, 780, 560, null],
    ["selection-blocked", 2, 0, 0.03, 460, 290, 42],
    ["invalid-move", 2, 0, 0.06, 280, 180, 16],
    ["promotion", 3, 0, 0.055, 720, 860, 60],
    ["castle", 2, 0, 0.065, 780, 560, 90],
    ["low-time", 2, 0, 0.042, 1180, 980, 110],
    ["check", 2, 0, 0.18, 520, 495, null],
    ["checkmate", 3, 0, 0.08, 760, 720, 90],
    ["game-over", 3, 0, 0.12, 880, 840, 120],
    ["undo", 2, 0, 0.065, 380, 680, 60],
  ] as const)(
    "synthesizes %s with the expected oscillator count and timing",
    async (event, oscillatorCount, bufferSourceCount, durationSec, startFreq, endFreq, secondDelayMs) => {
      const { AudioContextMock, context, oscillators, gainNodes, bufferSources } = installAudioContextMock();
      const { soundService } = await import("./soundService");

      expect(soundService.play(event)).toBe(true);

      expect(AudioContextMock).toHaveBeenCalledTimes(1);
      expect(context.createOscillator).toHaveBeenCalledTimes(oscillatorCount);
      expect(context.createBufferSource).toHaveBeenCalledTimes(bufferSourceCount);
      expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(startFreq, context.currentTime);
      expect(oscillators[0]?.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        endFreq,
        context.currentTime + durationSec * 0.7,
      );
      expect(oscillators[0]?.start).toHaveBeenCalledWith(context.currentTime);
      expect(oscillators[0]?.stop).toHaveBeenCalledWith(context.currentTime + durationSec);
      expect(gainNodes.length).toBe(oscillatorCount);
      expect(bufferSources.length).toBe(bufferSourceCount);

      if (secondDelayMs !== null) {
        expect(oscillators[1]?.start).toHaveBeenCalledWith(context.currentTime + secondDelayMs / 1000);
      }
    },
  );

  it("uses a filtered noise burst for captures and respects enable/disable state", async () => {
    const { AudioContextMock, context, oscillators, gainNodes, bufferSources, filters } = installAudioContextMock();
    const { soundService } = await import("./soundService");

    soundService.setVolume(0.5);
    soundService.play("piece-capture");

    expect(AudioContextMock).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(context.createBufferSource).toHaveBeenCalledTimes(1);
    expect(context.createBiquadFilter).toHaveBeenCalledTimes(1);
    expect(context.createBuffer).toHaveBeenCalledWith(1, 3_360, 48_000);
    expect(gainNodes.length).toBe(2);
    expect(gainNodes[0]?.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, context.currentTime);
    expect(gainNodes[0]?.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.325,
      context.currentTime + 0.012,
    );
    expect(bufferSources[0]?.start).toHaveBeenCalledWith(context.currentTime);
    expect(bufferSources[0]?.stop).toHaveBeenCalledWith(context.currentTime + 0.07);
    expect(filters[0]?.type).toBe("bandpass");

    soundService.setEnabled(false);
    expect(soundService.play("piece-move")).toBe(false);

    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillators).toHaveLength(1);
  });

  it("resumes suspended audio contexts before scheduling playback", async () => {
    const { context } = installAudioContextMock("suspended");
    const { soundService } = await import("./soundService");

    soundService.play("piece-select");

    expect(context.resume).toHaveBeenCalledTimes(1);
  });
});
