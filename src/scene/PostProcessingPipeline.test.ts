import { beforeEach, describe, expect, it, vi } from "vitest";

let latestComposer: any = null;
let latestRenderTargetOptions: Record<string, unknown> | null = null;
let latestBloomPass: any = null;
let latestFxaaPass: any = null;

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
    addPass = vi.fn((pass) => {
      (this as any).passes.push(pass);
    });
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    passes: any[] = [];

    constructor(...args: unknown[]) {
      void args;
      latestComposer = this as any;
    }
  },
}));

vi.mock("three/examples/jsm/postprocessing/RenderPass.js", () => ({
  RenderPass: class {
    dispose = vi.fn();
    constructor(...args: unknown[]) {
      void args;
    }
  },
}));

vi.mock("three/examples/jsm/postprocessing/UnrealBloomPass.js", async () => {
  return {
    UnrealBloomPass: class {
      enabled = true;
      strength = 0;
      resolution = {
        x: 0,
        y: 0,
        set: vi.fn((x: number, y: number) => {
          (this as any).resolution.x = x;
          (this as any).resolution.y = y;
        }),
      };
      setSize = vi.fn();
      dispose = vi.fn();
      renderTargetsHorizontal = [{ dispose: vi.fn() }];
      renderTargetsVertical = [{ dispose: vi.fn() }];

      constructor(...args: unknown[]) {
        void args;
        latestBloomPass = this as any;
      }
    },
  };
});

vi.mock("three/examples/jsm/shaders/FXAAShader.js", () => ({
  FXAAShader: {
    uniforms: {
      resolution: { value: { set: vi.fn() } },
    },
  },
}));

vi.mock("three/examples/jsm/postprocessing/OutputPass.js", () => ({
  OutputPass: class {},
}));

vi.mock("three/examples/jsm/postprocessing/ShaderPass.js", () => ({
  ShaderPass: class {
    uniforms: any;
    dispose = vi.fn();
    constructor(shader: any) {
      this.uniforms = JSON.parse(JSON.stringify(shader.uniforms || {}));
      if (this.uniforms.resolution) {
        this.uniforms.resolution.value = { set: vi.fn() };
        latestFxaaPass = this as any;
      }
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
    expect(latestFxaaPass?.uniforms.resolution.value.set).toHaveBeenLastCalledWith(1 / 960, 1 / 540);
  });

  it("disposes of existing passes and the composer when rebuilding", () => {
    const renderer = {
      capabilities: { isWebGL2: true, maxSamples: 4 },
      getSize: vi.fn(() => new Vector2(800, 600)),
      getPixelRatio: vi.fn(() => 1),
      render: vi.fn(),
    };
    const pipeline = new PostProcessingPipeline(renderer as never, {} as never, {} as never);

    const firstComposer = latestComposer;
    const firstPasses = [...(firstComposer?.passes || [])];

    // Trigger rebuild
    pipeline.setAntiAliasing(2, false);

    expect(firstComposer?.dispose).toHaveBeenCalled();
    firstPasses.forEach((pass) => {
      if (pass.dispose) {
        expect(pass.dispose).toHaveBeenCalled();
      }
      if (pass.renderTargetsHorizontal) {
        pass.renderTargetsHorizontal.forEach((rt: any) => expect(rt.dispose).toHaveBeenCalled());
      }
    });
  });
});
