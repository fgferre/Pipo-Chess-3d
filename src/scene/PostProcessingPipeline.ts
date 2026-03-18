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
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private vignettePass: ShaderPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    const size = renderer.getSize(new Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const w = size.width * pixelRatio;
    const h = size.height * pixelRatio;

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

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = Math.max(0, strength);
  }

  getBloomStrength(): number {
    return this.bloomPass.strength;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setSize(width * pixelRatio, height * pixelRatio);
    this.bloomPass.resolution.set(width * pixelRatio, height * pixelRatio);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
