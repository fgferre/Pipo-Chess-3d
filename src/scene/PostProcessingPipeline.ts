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
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;
  private enabled = true;
  private bloomResolutionScale = 1;
  private size = new Vector2();
  private pixelRatio = 1;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const size = renderer.getSize(new Vector2());
    this.pixelRatio = renderer.getPixelRatio();
    this.size.copy(size);
    const w = size.width * this.pixelRatio;
    const h = size.height * this.pixelRatio;

    // Use HalfFloat render target to preserve HDR values for bloom
    const renderTarget = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      format: RGBAFormat,
      depthBuffer: true,
    });

    this.composer = new EffectComposer(renderer, renderTarget);

    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new Vector2(w, h),
      0.08,  // strength — extremely subtle glow
      0.25,  // radius — tighter bloom
      1.12,  // threshold — only allow bloom on extreme specular highlights (>1.0 HDR)
    );
    this.composer.addPass(this.bloomPass);

    this.vignettePass = new ShaderPass(new ShaderMaterial(VignetteShader));
    this.composer.addPass(this.vignettePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bloomPass.enabled = enabled && this.bloomResolutionScale > 0;
  }

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = Math.max(0, strength);
  }

  getBloomStrength(): number {
    return this.bloomPass.strength;
  }

  setBloomResolutionScale(scale: number): void {
    this.bloomResolutionScale = Math.max(0, scale);
    this.syncBloomResolution();
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.size.set(width, height);
    this.pixelRatio = pixelRatio;
    this.composer.setSize(width * pixelRatio, height * pixelRatio);
    this.syncBloomResolution();
  }

  render(): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }

  private syncBloomResolution(): void {
    const width = this.size.x * this.pixelRatio;
    const height = this.size.y * this.pixelRatio;
    const targetWidth = Math.max(1, Math.round(width * this.bloomResolutionScale));
    const targetHeight = Math.max(1, Math.round(height * this.bloomResolutionScale));

    this.bloomPass.enabled = this.enabled && this.bloomResolutionScale > 0;
    this.bloomPass.setSize(targetWidth, targetHeight);
    this.bloomPass.resolution.set(targetWidth, targetHeight);
  }
}
