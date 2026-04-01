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

const StableFXAAShader = {
  name: "StableFXAAShader",
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(1 / 1024, 1 / 512) },
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
    uniform vec2 resolution;
    varying vec2 vUv;

    float _ContrastThreshold = 0.0312;
    float _RelativeThreshold = 0.063;
    float _SubpixelBlending = 1.0;

    vec4 Sample(sampler2D tex2D, vec2 uv) {
      return texture(tex2D, uv);
    }

    float SampleLuminance(sampler2D tex2D, vec2 uv) {
      return dot(Sample(tex2D, uv).rgb, vec3(0.3, 0.59, 0.11));
    }

    float SampleLuminance(sampler2D tex2D, vec2 texSize, vec2 uv, float uOffset, float vOffset) {
      uv += texSize * vec2(uOffset, vOffset);
      return SampleLuminance(tex2D, uv);
    }

    struct LuminanceData {
      float m, n, e, s, w;
      float ne, nw, se, sw;
      float highest, lowest, contrast;
    };

    LuminanceData SampleLuminanceNeighborhood(sampler2D tex2D, vec2 texSize, vec2 uv) {
      LuminanceData l;
      l.m = SampleLuminance(tex2D, uv);
      l.n = SampleLuminance(tex2D, texSize, uv, 0.0, 1.0);
      l.e = SampleLuminance(tex2D, texSize, uv, 1.0, 0.0);
      l.s = SampleLuminance(tex2D, texSize, uv, 0.0, -1.0);
      l.w = SampleLuminance(tex2D, texSize, uv, -1.0, 0.0);
      l.ne = SampleLuminance(tex2D, texSize, uv, 1.0, 1.0);
      l.nw = SampleLuminance(tex2D, texSize, uv, -1.0, 1.0);
      l.se = SampleLuminance(tex2D, texSize, uv, 1.0, -1.0);
      l.sw = SampleLuminance(tex2D, texSize, uv, -1.0, -1.0);
      l.highest = max(max(max(max(l.n, l.e), l.s), l.w), l.m);
      l.lowest = min(min(min(min(l.n, l.e), l.s), l.w), l.m);
      l.contrast = l.highest - l.lowest;
      return l;
    }

    bool ShouldSkipPixel(LuminanceData l) {
      float threshold = max(_ContrastThreshold, _RelativeThreshold * l.highest);
      return l.contrast < threshold;
    }

    float DeterminePixelBlendFactor(LuminanceData l) {
      float f = 2.0 * (l.n + l.e + l.s + l.w);
      f += l.ne + l.nw + l.se + l.sw;
      f *= 1.0 / 12.0;
      f = abs(f - l.m);
      f = clamp(f / l.contrast, 0.0, 1.0);

      float blendFactor = smoothstep(0.0, 1.0, f);
      return blendFactor * blendFactor * _SubpixelBlending;
    }

    struct EdgeData {
      bool isHorizontal;
      float pixelStep;
      float oppositeLuminance;
      float gradient;
    };

    EdgeData DetermineEdge(vec2 texSize, LuminanceData l) {
      EdgeData e;
      float horizontal =
        abs(l.n + l.s - 2.0 * l.m) * 2.0 +
        abs(l.ne + l.se - 2.0 * l.e) +
        abs(l.nw + l.sw - 2.0 * l.w);
      float vertical =
        abs(l.e + l.w - 2.0 * l.m) * 2.0 +
        abs(l.ne + l.nw - 2.0 * l.n) +
        abs(l.se + l.sw - 2.0 * l.s);
      e.isHorizontal = horizontal >= vertical;

      float pLuminance = e.isHorizontal ? l.n : l.e;
      float nLuminance = e.isHorizontal ? l.s : l.w;
      float pGradient = abs(pLuminance - l.m);
      float nGradient = abs(nLuminance - l.m);

      e.pixelStep = e.isHorizontal ? texSize.y : texSize.x;
      e.oppositeLuminance = pLuminance;
      e.gradient = pGradient;

      if (pGradient < nGradient) {
        e.pixelStep = -e.pixelStep;
        e.oppositeLuminance = nLuminance;
        e.gradient = nGradient;
      }

      return e;
    }

    void AdvanceEdgeSample(
      sampler2D tex2D,
      vec2 edgeStep,
      float stepDistance,
      float edgeLuminance,
      float gradientThreshold,
      float direction,
      inout vec2 sampleUv,
      inout float luminanceDelta,
      inout bool atEnd
    ) {
      if (atEnd) {
        return;
      }

      sampleUv += edgeStep * stepDistance * direction;
      luminanceDelta = SampleLuminance(tex2D, sampleUv) - edgeLuminance;
      atEnd = abs(luminanceDelta) >= gradientThreshold;
    }

    float DetermineEdgeBlendFactor(sampler2D tex2D, vec2 texSize, LuminanceData l, EdgeData e, vec2 uv) {
      vec2 uvEdge = uv;
      vec2 edgeStep = vec2(0.0);
      if (e.isHorizontal) {
        uvEdge.y += e.pixelStep * 0.5;
        edgeStep = vec2(texSize.x, 0.0);
      } else {
        uvEdge.x += e.pixelStep * 0.5;
        edgeStep = vec2(0.0, texSize.y);
      }

      float edgeLuminance = (l.m + e.oppositeLuminance) * 0.5;
      float gradientThreshold = e.gradient * 0.25;

      vec2 puv = uvEdge + edgeStep * 1.0;
      float pLuminanceDelta = SampleLuminance(tex2D, puv) - edgeLuminance;
      bool pAtEnd = abs(pLuminanceDelta) >= gradientThreshold;
      AdvanceEdgeSample(tex2D, edgeStep, 1.5, edgeLuminance, gradientThreshold, 1.0, puv, pLuminanceDelta, pAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, 1.0, puv, pLuminanceDelta, pAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, 1.0, puv, pLuminanceDelta, pAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, 1.0, puv, pLuminanceDelta, pAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 4.0, edgeLuminance, gradientThreshold, 1.0, puv, pLuminanceDelta, pAtEnd);
      if (!pAtEnd) {
        puv += edgeStep * 8.0;
      }

      vec2 nuv = uvEdge - edgeStep * 1.0;
      float nLuminanceDelta = SampleLuminance(tex2D, nuv) - edgeLuminance;
      bool nAtEnd = abs(nLuminanceDelta) >= gradientThreshold;
      AdvanceEdgeSample(tex2D, edgeStep, 1.5, edgeLuminance, gradientThreshold, -1.0, nuv, nLuminanceDelta, nAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, -1.0, nuv, nLuminanceDelta, nAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, -1.0, nuv, nLuminanceDelta, nAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 2.0, edgeLuminance, gradientThreshold, -1.0, nuv, nLuminanceDelta, nAtEnd);
      AdvanceEdgeSample(tex2D, edgeStep, 4.0, edgeLuminance, gradientThreshold, -1.0, nuv, nLuminanceDelta, nAtEnd);
      if (!nAtEnd) {
        nuv -= edgeStep * 8.0;
      }

      float pDistance = 0.0;
      float nDistance = 0.0;
      if (e.isHorizontal) {
        pDistance = puv.x - uv.x;
        nDistance = uv.x - nuv.x;
      } else {
        pDistance = puv.y - uv.y;
        nDistance = uv.y - nuv.y;
      }

      float shortestDistance = pDistance;
      bool deltaSign = pLuminanceDelta >= 0.0;
      if (pDistance > nDistance) {
        shortestDistance = nDistance;
        deltaSign = nLuminanceDelta >= 0.0;
      }

      if (deltaSign == (l.m - edgeLuminance >= 0.0)) {
        return 0.0;
      }

      return 0.5 - shortestDistance / max(pDistance + nDistance, 0.0001);
    }

    vec4 ApplyFXAA(sampler2D tex2D, vec2 texSize, vec2 uv) {
      LuminanceData luminance = SampleLuminanceNeighborhood(tex2D, texSize, uv);
      vec4 color = Sample(tex2D, uv);

      if (!ShouldSkipPixel(luminance)) {
        float pixelBlend = DeterminePixelBlendFactor(luminance);
        EdgeData edge = DetermineEdge(texSize, luminance);
        float edgeBlend = DetermineEdgeBlendFactor(tex2D, texSize, luminance, edge, uv);
        float finalBlend = max(pixelBlend, edgeBlend);

        if (edge.isHorizontal) {
          uv.y += edge.pixelStep * finalBlend;
        } else {
          uv.x += edge.pixelStep * finalBlend;
        }

        color = Sample(tex2D, uv);
      }

      return color;
    }

    void main() {
      gl_FragColor = ApplyFXAA(tDiffuse, resolution.xy, vUv);
    }
  `,
};

interface DisposableResource {
  dispose: () => void;
}

type DisposableCandidate = DisposableResource | null | undefined;

function isDisposableResource(value: unknown): value is DisposableResource {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { dispose?: unknown };
  return typeof candidate.dispose === "function";
}

export class PostProcessingPipeline {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private vignettePass!: ShaderPass;
  private fxaaPass: ShaderPass | null = null;
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

  private disposePassResources(pass: unknown): void {
    if (typeof pass !== "object" || pass === null) {
      return;
    }

    const typedPass = pass as {
      material?: DisposableCandidate | DisposableCandidate[];
      fsQuad?: { material?: DisposableCandidate } | null;
      dispose?: (() => void) | null;
    };

    if (Array.isArray(typedPass.material)) {
      typedPass.material.forEach((material) => {
        if (isDisposableResource(material)) {
          material.dispose();
        }
      });
    } else if (isDisposableResource(typedPass.material)) {
      typedPass.material.dispose();
    }

    if (typedPass.fsQuad && isDisposableResource(typedPass.fsQuad.material)) {
      typedPass.fsQuad.material.dispose();
    }

    if (pass instanceof UnrealBloomPass) {
      pass.renderTargetsHorizontal.forEach((target) => target.dispose());
      pass.renderTargetsVertical.forEach((target) => target.dispose());
    }

    if (typeof typedPass.dispose === "function") {
      typedPass.dispose();
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

    this.fxaaPass = this.fxaaEnabled ? new ShaderPass(StableFXAAShader) : null;
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

    if (this.fxaaPass) {
      this.fxaaPass.uniforms["resolution"].value.set(1 / width, 1 / height);
    }
  }
}
