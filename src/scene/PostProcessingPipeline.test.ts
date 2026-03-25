import { beforeEach, describe, expect, it, vi } from "vitest";

let latestComposer: {
  addPass: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} | null = null;
let latestRenderTargetOptions: Record<string, unknown> | null = null;
let latestBloomPass: {
  enabled: boolean;
  strength: number;
  resolution: { x: number; y: number; set: ReturnType<typeof vi.fn> };
  setSize: ReturnType<typeof vi.fn>;
} | null = null;
let latestFxaaPass: {
  setSize: ReturnType<typeof vi.fn>;
} | null = null;

vi.mock("three", () => {
  class Vector2 {
    x: number;
    y: number;

    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }

    set(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }

    copy(other: Vector2) {
      this.x = other.x;
      this.y = other.y;
      return this;
    }
  }

  class WebGLRenderTarget {
    samples = 0;

    constructor(_width: unknown, _height: unknown, options: Record<string, unknown> = {}) {
      latestRenderTargetOptions = options;
      this.samples = typeof options.samples === "number" ? options.samples : 0;
    }
  }

  class ShaderMaterial {
    constructor(...args: unknown[]) {
      void args;
    }
  }

  return {
    WebGLRenderTarget,
    HalfFloatType: "HalfFloatType",
    RGBAFormat: "RGBAFormat",
    LinearFilter: "LinearFilter",
    Scene: class {},
    Camera: class {},
    Vector2,
    ShaderMaterial,
  };
});

vi.mock("three/examples/jsm/postprocessing/EffectComposer.js", () => ({
  EffectComposer: class {
    addPass = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();

    constructor(...args: unknown[]) {
      void args;
      latestComposer = this;
    }
  },
}));

vi.mock("three/examples/jsm/postprocessing/RenderPass.js", () => ({
  RenderPass: class {
    constructor(...args: unknown[]) {
      void args;
    }
  },
}));

vi.mock("three/examples/jsm/postprocessing/UnrealBloomPass.js", async () => {
  const { Vector2 } = await import("three");

  return {
    UnrealBloomPass: class {
      enabled = true;
      strength = 0;
      resolution = {
        x: 0,
        y: 0,
        set: vi.fn((x: number, y: number) => {
          this.resolution.x = x;
          this.resolution.y = y;
        }),
      };
      setSize = vi.fn();

      constructor(...args: unknown[]) {
        void args;
        latestBloomPass = this;
        this.resolution = {
          ...this.resolution,
          x: new Vector2().x,
          y: new Vector2().y,
        };
      }
    },
  };
});

vi.mock("three/examples/jsm/postprocessing/FXAAPass.js", () => ({
  FXAAPass: class {
    setSize = vi.fn();

    constructor() {
      latestFxaaPass = this;
    }
  },
}));

vi.mock("three/examples/jsm/postprocessing/OutputPass.js", () => ({
  OutputPass: class {},
}));

vi.mock("three/examples/jsm/postprocessing/ShaderPass.js", () => ({
  ShaderPass: class {
    constructor(...args: unknown[]) {
      void args;
    }
  },
}));

import { Vector2 } from "three";
import { PostProcessingPipeline } from "./PostProcessingPipeline";

describe("PostProcessingPipeline", () => {
  beforeEach(() => {
    latestComposer = null;
    latestRenderTargetOptions = null;
    latestBloomPass = null;
    latestFxaaPass = null;
  });

  it("bypasses the composer and renders directly when disabled", () => {
    const renderer = {
      capabilities: {
        isWebGL2: true,
        maxSamples: 4,
      },
      getSize: vi.fn(() => new Vector2(800, 600)),
      getPixelRatio: vi.fn(() => 2),
      render: vi.fn(),
    };
    const scene = {};
    const camera = {};
    const pipeline = new PostProcessingPipeline(renderer as never, scene as never, camera as never);

    pipeline.setEnabled(false);
    pipeline.render();

    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    expect(latestComposer?.render).not.toHaveBeenCalled();
  });

  it("resizes the bloom pass using the configured resolution scale", () => {
    const renderer = {
      capabilities: {
        isWebGL2: true,
        maxSamples: 4,
      },
      getSize: vi.fn(() => new Vector2(640, 360)),
      getPixelRatio: vi.fn(() => 2),
      render: vi.fn(),
    };
    const pipeline = new PostProcessingPipeline(renderer as never, {} as never, {} as never);

    pipeline.setBloomResolutionScale(0.5);
    pipeline.setSize(640, 360, 2);

    expect(latestComposer?.setSize).toHaveBeenCalledWith(1280, 720);
    expect(latestBloomPass?.setSize).toHaveBeenLastCalledWith(640, 360);
    expect(latestBloomPass?.resolution.set).toHaveBeenLastCalledWith(640, 360);
  });

  it("uses multisampled post-processing targets on supported renderers", () => {
    const renderer = {
      capabilities: {
        isWebGL2: true,
        maxSamples: 8,
      },
      getSize: vi.fn(() => new Vector2(640, 360)),
      getPixelRatio: vi.fn(() => 1),
      render: vi.fn(),
    };
    const pipeline = new PostProcessingPipeline(renderer as never, {} as never, {} as never);

    pipeline.setAntiAliasing(4, true);

    expect(latestRenderTargetOptions?.samples).toBe(4);
    expect(latestFxaaPass).toBeNull();
  });

  it("falls back to FXAA when multisampled post-processing is unavailable", () => {
    const renderer = {
      capabilities: {
        isWebGL2: false,
        maxSamples: 0,
      },
      getSize: vi.fn(() => new Vector2(640, 360)),
      getPixelRatio: vi.fn(() => 1.5),
      render: vi.fn(),
    };
    const pipeline = new PostProcessingPipeline(renderer as never, {} as never, {} as never);

    pipeline.setAntiAliasing(4, true);
    pipeline.setSize(640, 360, 1.5);

    expect(latestRenderTargetOptions?.samples).toBe(0);
    expect(latestFxaaPass?.setSize).toHaveBeenLastCalledWith(960, 540);
  });
});
