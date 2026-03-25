import {
  WebGLRenderer,
  WebGLRenderTarget,
  HalfFloatType,
  RGBAFormat,
  LinearFilter,
  Scene,
  Camera,
  Vector2,
  ShaderMaterial,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const VignetteShader = {
  name: "VignetteShader",
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.88 },
    darkness: { value: 0.56 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
      texel.rgb *= vignette;
      gl_FragColor = texel;
    }
  `,
};

export class PostProcessingPipeline {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private vignettePass!: ShaderPass;
  private fxaaPass: FXAAPass | null = null;
  private enabled = true;
  private bloomStrength = 0.08;
  private bloomResolutionScale = 1;
  private multisampling = 0;
  private fxaaEnabled = false;
  private size = new Vector2();
  private pixelRatio = 1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getSize(new Vector2());
    this.pixelRatio = renderer.getPixelRatio();
    this.size.copy(size);
    this.rebuildComposer();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bloomPass.enabled = enabled && this.bloomResolutionScale > 0;
  }

  setAntiAliasing(multisampling: number, fxaaEnabled: boolean): void {
    const nextMultisampling = this.resolveMultisampling(multisampling);
    const nextFxaaEnabled = fxaaEnabled && nextMultisampling === 0;
    if (nextMultisampling === this.multisampling && nextFxaaEnabled === this.fxaaEnabled) {
      return;
    }

    this.multisampling = nextMultisampling;
    this.fxaaEnabled = nextFxaaEnabled;
    this.rebuildComposer();
  }

  setBloomStrength(strength: number): void {
    this.bloomStrength = Math.max(0, strength);
    if (this.bloomPass) {
      this.bloomPass.strength = this.bloomStrength;
    }
  }

  getBloomStrength(): number {
    return this.bloomStrength;
  }

  setBloomResolutionScale(scale: number): void {
    this.bloomResolutionScale = Math.max(0, scale);
    this.syncPassResolutions();
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.size.set(width, height);
    this.pixelRatio = pixelRatio;
    this.composer.setSize(width * pixelRatio, height * pixelRatio);
    this.syncPassResolutions();
  }

  render(): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.composer.render();
  }

  dispose(): void {
    if (this.composer) {
      this.composer.passes.forEach((pass) => this.disposePassResources(pass));
      this.composer.dispose();
    }
  }

  private disposePassResources(pass: any): void {
    if (!pass) return;

    if (pass.material) {
      if (Array.isArray(pass.material)) {
        pass.material.forEach((m: any) => m.dispose());
      } else {
        pass.material.dispose();
      }
    }

    if (pass.fsQuad && pass.fsQuad.material) {
      pass.fsQuad.material.dispose();
    }

    if (pass instanceof UnrealBloomPass) {
      pass.renderTargetsHorizontal.forEach((rt: any) => rt.dispose());
      pass.renderTargetsVertical.forEach((rt: any) => rt.dispose());
    }

    if (typeof pass.dispose === "function") {
      pass.dispose();
    }
  }

  private rebuildComposer(): void {
    const width = Math.max(1, Math.round(this.size.x * this.pixelRatio));
    const height = Math.max(1, Math.round(this.size.y * this.pixelRatio));

    if (this.composer) {
      this.composer.passes.forEach((pass) => this.disposePassResources(pass));
      this.composer.dispose();
    }

    // Preserve HDR values for bloom while enabling MSAA on supported tiers.
    const renderTarget = new WebGLRenderTarget(width, height, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      format: RGBAFormat,
      depthBuffer: true,
      samples: this.multisampling,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new Vector2(width, height),
      this.bloomStrength,
      0.25,
      1.12,
    );
    this.composer.addPass(this.bloomPass);

    this.vignettePass = new ShaderPass(new ShaderMaterial(VignetteShader));
    this.composer.addPass(this.vignettePass);

    this.fxaaPass = this.fxaaEnabled ? new FXAAPass() : null;
    if (this.fxaaPass) {
      this.composer.addPass(this.fxaaPass);
    }

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
    this.composer.setSize(width, height);
    this.syncPassResolutions();
  }

  private resolveMultisampling(multisampling: number): number {
    const requestedSamples = Math.max(0, Math.floor(multisampling));
    if (requestedSamples === 0 || !this.renderer.capabilities.isWebGL2) {
      return 0;
    }

    return Math.min(requestedSamples, this.renderer.capabilities.maxSamples);
  }

  private syncPassResolutions(): void {
    const width = this.size.x * this.pixelRatio;
    const height = this.size.y * this.pixelRatio;
    const targetWidth = Math.max(1, Math.round(width * this.bloomResolutionScale));
    const targetHeight = Math.max(1, Math.round(height * this.bloomResolutionScale));

    this.bloomPass.enabled = this.enabled && this.bloomResolutionScale > 0;
    this.bloomPass.setSize(targetWidth, targetHeight);
    this.bloomPass.resolution.set(targetWidth, targetHeight);
    this.fxaaPass?.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  }
}
