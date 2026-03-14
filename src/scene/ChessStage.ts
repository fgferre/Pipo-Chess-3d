import {
  WebGLRenderer,
  SRGBColorSpace,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  BufferGeometry,
  PerspectiveCamera,
  Scene,
  Group,
  Mesh,
  Color,
  FogExp2,
  HemisphereLight,
  SpotLight,
  DirectionalLight,
  PMREMGenerator,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
  WebGLRenderTarget,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  ExtrudeGeometry,
  Vector2,
  Raycaster,
  Shape,
  CanvasTexture,
  RepeatWrapping,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Square } from "chess.js";
import type { Orientation, ThemeDefinition } from "../types/game";
import { fenToPieces, squareToCoords } from "../utils/board";

const SEGMENTS = 64;
const CLICK_THRESHOLD_PX = 6;
const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const BOARD_TEXTURE_VARIATIONS = 4;

const DEFAULT_BOARD_PALETTE = {
  lightSquares: { baseHex: "#e0b576", veinHex: "#a36d26", isKnotty: false },
  darkSquares: { baseHex: "#5c2e16", veinHex: "#1a0b05", isKnotty: true },
  frame: { baseHex: "#361a0d", veinHex: "#0a0402", isKnotty: true },
  groutHex: "#050505",
} satisfies BoardMaterialPalette;

const SQUARE_WOOD_MATERIAL = {
  bumpScale: 0.01,
  roughness: 0.4,
  metalness: 0.0,
  clearcoat: 0.2,
  clearcoatRoughness: 0.3,
} as const;

const FRAME_WOOD_MATERIAL = {
  bumpScale: 0.012,
  roughness: 0.5,
  metalness: 0.02,
  clearcoat: 0.1,
  clearcoatRoughness: 0.3,
} as const;

interface HighlightState {
  selectedSquare: Square | null;
  legalTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
}

interface RenderState extends HighlightState {
  fen: string;
  orientation: Orientation;
  theme: ThemeDefinition;
}

interface WoodPalette {
  baseHex: string;
  veinHex: string;
  isKnotty: boolean;
}

interface BoardMaterialPalette {
  lightSquares: WoodPalette;
  darkSquares: WoodPalette;
  frame: WoodPalette;
  groutHex: string;
}

interface WoodMaterialTuning {
  bumpScale: number;
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export function resolveSquareFromBoardPoint(localX: number, localZ: number): Square | null {
  const fileIndex = Math.floor(localX + 4);
  const rank = 8 - Math.floor(localZ + 4);

  if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) {
    return null;
  }

  return `${files[fileIndex]}${rank}` as Square;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mixHex(startHex: string, endHex: string, amount: number): string {
  const color = new Color(startHex);
  color.lerp(new Color(endHex), clampUnit(amount));
  return `#${color.getHexString()}`;
}

function shiftHex(hex: string, saturationDelta: number, lightnessDelta: number): string {
  const color = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    clampUnit(hsl.s + saturationDelta),
    clampUnit(hsl.l + lightnessDelta),
  );
  return `#${color.getHexString()}`;
}

export function deriveBoardPalette(theme: ThemeDefinition): BoardMaterialPalette {
  return {
    lightSquares: {
      baseHex: shiftHex(mixHex(theme.boardLight, "#f6e3bf", 0.14), 0.04, 0.03),
      veinHex: shiftHex(mixHex(theme.boardLight, theme.boardDark, 0.52), 0.08, -0.16),
      isKnotty: false,
    },
    darkSquares: {
      baseHex: shiftHex(mixHex(theme.boardDark, theme.boardFrame, 0.18), 0.03, -0.02),
      veinHex: shiftHex(mixHex(theme.boardFrame, "#050302", 0.62), 0.04, -0.08),
      isKnotty: true,
    },
    frame: {
      baseHex: shiftHex(mixHex(theme.boardFrame, theme.boardDark, 0.1), 0.03, -0.02),
      veinHex: shiftHex(mixHex(theme.boardFrame, "#050302", 0.7), 0.05, -0.1),
      isKnotty: true,
    },
    groutHex: mixHex(theme.boardFrame, "#050505", 0.74),
  };
}

// ─── Wood Texture Generator ────────────────────────────────────────────────

function createWoodTexture(
  renderer: WebGLRenderer,
  baseHex: string,
  veinHex: string,
  isKnotty = false,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  const centerX = isKnotty ? 300 : -1500;
  const centerY = isKnotty ? 400 : 512;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let r = 10; r < 3500; r += Math.random() * 25 + 15) {
    ctx.beginPath();
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = Math.random() * 0.4 + 0.15;
    ctx.lineWidth = Math.random() * 14 + 6;

    for (let angle = -Math.PI / 2; angle < Math.PI * 1.5; angle += 0.05) {
      let noise = Math.sin(angle * 6) * 15 + Math.cos(angle * 4) * 20;
      if (isKnotty) {
        noise += Math.sin(angle * 12) * 10;
      } else {
        noise += Math.sin(r * 0.02 + angle * 3) * 50;
      }
      const x = centerX + Math.cos(angle) * (r + noise);
      const y = centerY + Math.sin(angle) * (r + noise) * (isKnotty ? 1.5 : 4.0);
      if (angle === -Math.PI / 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(512, 512, 300, 512, 512, 800);
  grad.addColorStop(0, "rgba(255,255,255,0.02)");
  grad.addColorStop(1, "rgba(0,0,0,0.2)");
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function collectMaterialTextures(
  material: MeshPhysicalMaterial | MeshStandardMaterial,
): Set<Texture> {
  const textures = new Set<Texture>();

  if (material.map) {
    textures.add(material.map);
  }
  if ("bumpMap" in material && material.bumpMap) {
    textures.add(material.bumpMap);
  }

  return textures;
}

function applyWoodMaterialTheme(
  renderer: WebGLRenderer,
  material: MeshPhysicalMaterial,
  role: keyof Omit<BoardMaterialPalette, "groutHex">,
  palette: WoodPalette,
  tuning: WoodMaterialTuning,
): void {
  const previousTextures = collectMaterialTextures(material);
  const texture = createWoodTexture(renderer, palette.baseHex, palette.veinHex, palette.isKnotty);

  material.map = texture;
  material.bumpMap = texture;
  material.bumpScale = tuning.bumpScale;
  material.roughness = tuning.roughness;
  material.metalness = tuning.metalness;
  material.clearcoat = tuning.clearcoat;
  material.clearcoatRoughness = tuning.clearcoatRoughness;
  material.userData.boardRole = role;
  material.userData.boardPalette = { ...palette };
  material.needsUpdate = true;

  previousTextures.forEach((previousTexture) => previousTexture.dispose());
}

// ─── Piece Prototype Builders ──────────────────────────────────────────────

function createPieceBase(
  material: MeshPhysicalMaterial,
  feltMat: MeshStandardMaterial,
): Group {
  const group = new Group();

  const felt = new Mesh(new CylinderGeometry(0.81, 0.81, 0.06, 32), feltMat);
  felt.name = "felt";
  felt.position.y = 0.03;
  felt.castShadow = true;
  felt.receiveShadow = true;
  group.add(felt);

  const base = new Mesh(new CylinderGeometry(0.78, 0.9, 0.34, SEGMENTS), material);
  base.position.y = 0.23;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  return group;
}

function createPawnPrototype(mat: MeshPhysicalMaterial): Group {
  const group = new Group();

  const points: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.8, 0),
    new Vector2(0.75, 0.2),
    new Vector2(0.7, 0.3),
    new Vector2(0.5, 0.5),
    new Vector2(0.35, 1.2),
    new Vector2(0.55, 1.4),
    new Vector2(0.55, 1.5),
    new Vector2(0.35, 1.6),
    new Vector2(0, 1.6),
  ];

  const body = new Mesh(new LatheGeometry(points, SEGMENTS), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new Mesh(new SphereGeometry(0.5, SEGMENTS, 32), mat);
  head.position.y = 2.0;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  return group;
}

function createRookPrototype(mat: MeshPhysicalMaterial): Group {
  const group = new Group();

  const points: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.9, 0),
    new Vector2(0.8, 0.4),
    new Vector2(0.65, 0.6),
    new Vector2(0.55, 1.8),
    new Vector2(0.75, 2.0),
    new Vector2(0.75, 2.2),
    new Vector2(0.6, 2.3),
    new Vector2(0.85, 2.45),
    new Vector2(0.85, 2.5),
    new Vector2(0.5, 2.5),
    new Vector2(0.5, 2.2),
    new Vector2(0, 2.2),
  ];

  const body = new Mesh(new LatheGeometry(points, SEGMENTS), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const numTeeth = 6;
  const toothSpan = (Math.PI * 2) / numTeeth;
  const solidSpan = toothSpan * 0.65;
  const bevelSize = 0.015;
  const rOut = 0.85 - bevelSize;
  const rIn = 0.5 + bevelSize;

  const toothShape = new Shape();
  toothShape.absarc(0, 0, rOut, 0, solidSpan, false);
  toothShape.lineTo(Math.cos(solidSpan) * rIn, Math.sin(solidSpan) * rIn);
  toothShape.absarc(0, 0, rIn, solidSpan, 0, true);
  toothShape.lineTo(rOut, 0);

  const toothGeo = new ExtrudeGeometry(toothShape, {
    depth: 0.35,
    bevelEnabled: true,
    bevelSegments: 6,
    steps: 1,
    bevelSize: bevelSize,
    bevelThickness: bevelSize,
  });
  toothGeo.rotateX(-Math.PI / 2);

  for (let i = 0; i < numTeeth; i++) {
    const tooth = new Mesh(toothGeo, mat);
    tooth.position.y = 2.5;
    tooth.rotation.y = i * toothSpan;
    tooth.castShadow = true;
    tooth.receiveShadow = true;
    group.add(tooth);
  }

  return group;
}

function createKnightPrototype(
  mat: MeshPhysicalMaterial,
  feltMat: MeshStandardMaterial,
  eyeMat: MeshPhysicalMaterial,
): Group {
  const group = new Group();

  group.add(createPieceBase(mat, feltMat));

  const pedestal = new Mesh(new CylinderGeometry(0.55, 0.7, 0.4, SEGMENTS), mat);
  pedestal.position.y = 0.6;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  const shape = new Shape();
  shape.moveTo(-0.4, 0);
  shape.bezierCurveTo(-0.6, 0.6, -0.2, 1.3, 0.0, 1.6);
  shape.lineTo(-0.1, 1.95);
  shape.lineTo(0.15, 1.65);
  shape.quadraticCurveTo(0.35, 1.7, 0.55, 1.2);
  shape.lineTo(0.75, 0.7);
  shape.quadraticCurveTo(0.8, 0.5, 0.55, 0.5);
  shape.lineTo(0.25, 0.85);
  shape.quadraticCurveTo(0.45, 0.4, 0.45, 0);
  shape.lineTo(-0.4, 0);

  const horseGeo = new ExtrudeGeometry(shape, {
    depth: 0.35,
    bevelEnabled: true,
    bevelSegments: 12,
    steps: 1,
    bevelSize: 0.08,
    bevelThickness: 0.12,
  });
  horseGeo.computeBoundingBox();
  const bb = horseGeo.boundingBox!;
  horseGeo.translate(0, 0, -0.5 * (bb.max.z + bb.min.z));

  const horse = new Mesh(horseGeo, mat);
  horse.position.y = 0.8;
  horse.scale.set(1.2, 1.2, 1.2);
  horse.rotation.y = -Math.PI / 2;
  horse.castShadow = true;
  horse.receiveShadow = true;
  group.add(horse);

  const eyeGeo = new SphereGeometry(0.06, 16, 16);

  const rightEye = new Mesh(eyeGeo, eyeMat);
  rightEye.name = "eye";
  rightEye.position.set(0.35, 1.35, 0.28);
  rightEye.castShadow = true;
  rightEye.receiveShadow = true;
  horse.add(rightEye);

  const leftEye = new Mesh(eyeGeo, eyeMat);
  leftEye.name = "eye";
  leftEye.position.set(0.35, 1.35, -0.28);
  leftEye.castShadow = true;
  leftEye.receiveShadow = true;
  horse.add(leftEye);

  return group;
}

function createBishopPrototype(mat: MeshPhysicalMaterial): Group {
  const group = new Group();

  const points: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.85, 0),
    new Vector2(0.8, 0.2),
    new Vector2(0.75, 0.4),
    new Vector2(0.55, 0.6),
    new Vector2(0.4, 1.8),
    new Vector2(0.65, 2.1),
    new Vector2(0.5, 2.3),
    new Vector2(0.6, 2.4),
    new Vector2(0.65, 2.6),
    new Vector2(0.45, 3.1),
    new Vector2(0.15, 3.4),
    new Vector2(0, 3.4),
  ];

  const body = new Mesh(new LatheGeometry(points, SEGMENTS), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const top = new Mesh(new SphereGeometry(0.15, 32, 16), mat);
  top.position.y = 3.5;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  return group;
}

function createQueenPrototype(mat: MeshPhysicalMaterial): Group {
  const group = new Group();

  const points: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.9, 0),
    new Vector2(0.85, 0.2),
    new Vector2(0.75, 0.4),
    new Vector2(0.6, 0.6),
    new Vector2(0.45, 0.9),
    new Vector2(0.4, 2.0),
    new Vector2(0.45, 2.5),
    new Vector2(0.75, 2.7),
    new Vector2(0.55, 2.9),
    new Vector2(0.45, 3.0),
    new Vector2(0.85, 3.5),
    new Vector2(0.75, 3.6),
    new Vector2(0.35, 3.2),
    new Vector2(0, 3.2),
  ];

  const body = new Mesh(new LatheGeometry(points, SEGMENTS), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const crown = new Mesh(new SphereGeometry(0.25, 32, 16), mat);
  crown.position.y = 3.45;
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown);

  return group;
}

function createKingPrototype(mat: MeshPhysicalMaterial): Group {
  const group = new Group();

  const points: Vector2[] = [
    new Vector2(0, 0),
    new Vector2(0.9, 0),
    new Vector2(0.85, 0.2),
    new Vector2(0.8, 0.4),
    new Vector2(0.65, 0.6),
    new Vector2(0.55, 0.8),
    new Vector2(0.45, 2.2),
    new Vector2(0.7, 2.8),
    new Vector2(0.55, 3.0),
    new Vector2(0.85, 3.2),
    new Vector2(0.85, 3.3),
    new Vector2(0.75, 3.6),
    new Vector2(0.5, 3.9),
    new Vector2(0.2, 4.0),
    new Vector2(0, 4.0),
  ];

  const body = new Mesh(new LatheGeometry(points, SEGMENTS), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const crossV = new Mesh(new BoxGeometry(0.2, 0.7, 0.2), mat);
  crossV.position.y = 4.35;
  crossV.castShadow = true;
  crossV.receiveShadow = true;
  group.add(crossV);

  const crossH = new Mesh(new BoxGeometry(0.6, 0.2, 0.2), mat);
  crossH.position.y = 4.45;
  crossH.castShadow = true;
  crossH.receiveShadow = true;
  group.add(crossH);

  return group;
}

// ─── Highlight Helper ──────────────────────────────────────────────────────

function createHighlight(
  square: Square,
  color: string,
  opacity: number,
  y = 0.05,
): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(0.9, 0.9),
    new MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      emissive: new Color(color),
      emissiveIntensity: 0.18,
    }),
  );
  const { x, z } = squareToCoords(square);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function collectMeshResources(
  root: Group | Mesh,
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }

    geometries.add(child.geometry);
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => materials.add(material));
      return;
    }
    materials.add(child.material);
  });
}

function disposeCollectedResources(
  geometries: Set<BufferGeometry>,
  materials: Set<Material>,
): void {
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    const textures = new Set<Texture>();
    Object.values(material).forEach((value) => {
      if (value instanceof Texture) {
        textures.add(value);
      }
    });
    textures.forEach((texture) => texture.dispose());
    material.dispose();
  });
}

function disposeObjectResources(root: Group | Mesh): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  collectMeshResources(root, geometries, materials);
  disposeCollectedResources(geometries, materials);
}

// ─── ChessStage Class ──────────────────────────────────────────────────────

export class ChessStage {
  private readonly container: HTMLDivElement;
  private readonly onSquareSelect: (square: Square) => void;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly pointerDownPosition = new Vector2();
  private readonly root = new Group();
  private readonly boardGroup = new Group();
  private readonly pieceGroup = new Group();
  private readonly highlightGroup = new Group();
  private readonly hitPlane = new Mesh(
    new PlaneGeometry(8, 8),
    new MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  private readonly lightSquareMats: MeshPhysicalMaterial[] = [];
  private readonly darkSquareMats: MeshPhysicalMaterial[] = [];
  private readonly frameMats: MeshPhysicalMaterial[] = [];
  private readonly prototypes = new Map<string, Group>();
  private readonly resizeObserver: ResizeObserver;
  private readonly eyeMat: MeshPhysicalMaterial;
  // Initialized in buildBoard() / init() before first use
  private lightPieceMat!: MeshPhysicalMaterial;
  private darkPieceMat!: MeshPhysicalMaterial;
  private feltMat!: MeshStandardMaterial;
  private accentMat!: MeshPhysicalMaterial;
  private groutMat!: MeshStandardMaterial;
  private environmentTarget: WebGLRenderTarget | null = null;
  private animationFrame = 0;
  private disposed = false;
  private paused = false;
  private activePointerId: number | null = null;
  private pointerMaxTravel = 0;
  private currentFen = "";
  private currentThemeId = "";
  private currentOrientation: Orientation = "white";
  private currentHighlightKey = "";
  private currentState: RenderState | null = null;

  constructor(container: HTMLDivElement, onSquareSelect: (square: Square) => void) {
    this.container = container;
    this.onSquareSelect = onSquareSelect;

    // The shell owns the backdrop gradient; the stage keeps a transparent canvas and
    // handles only in-scene atmosphere such as fog, felt, lighting, and materials.
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = "board-canvas";
    this.container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = new PerspectiveCamera(40, aspect, 0.1, 1000);
    this.camera.position.set(0, 24, 32);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 50;

    this.scene.fog = new FogExp2(0x050508, 0.012);

    this.scene.add(this.root);
    this.root.add(this.boardGroup, this.pieceGroup, this.highlightGroup);

    this.hitPlane.rotation.x = -Math.PI / 2;
    this.hitPlane.position.y = 0.03;
    this.root.add(this.hitPlane);

    this.eyeMat = new MeshPhysicalMaterial({
      color: 0x050505,
      roughness: 0.1,
      clearcoat: 0.5,
    });

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  async init(): Promise<void> {
    const pmremGenerator = new PMREMGenerator(this.renderer);
    this.environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.02);
    this.scene.environment = this.environmentTarget.texture;
    pmremGenerator.dispose();

    this.setupLighting();
    this.buildBoard();

    // Placeholder piece materials — colors updated on first applyTheme()
    this.lightPieceMat = new MeshPhysicalMaterial({
      color: 0xfffcf0,
      roughness: 0.4,
      metalness: 0.0,
      clearcoat: 0.1,
      clearcoatRoughness: 0.3,
    });
    this.darkPieceMat = new MeshPhysicalMaterial({
      color: 0x111111,
      roughness: 0.35,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.2,
    });

    const tempMat = new MeshPhysicalMaterial({ color: 0xffffff });
    this.prototypes.set("p", createPawnPrototype(tempMat));
    this.prototypes.set("r", createRookPrototype(tempMat));
    this.prototypes.set("n", createKnightPrototype(tempMat, this.feltMat, this.eyeMat));
    this.prototypes.set("b", createBishopPrototype(tempMat));
    this.prototypes.set("q", createQueenPrototype(tempMat));
    this.prototypes.set("k", createKingPrototype(tempMat));

    this.startLoop();
  }

  update(state: RenderState): void {
    this.currentState = state;

    if (state.orientation !== this.currentOrientation) {
      this.currentOrientation = state.orientation;
      this.root.rotation.y = state.orientation === "black" ? Math.PI : 0;
    }

    if (state.theme.id !== this.currentThemeId) {
      this.currentThemeId = state.theme.id;
      this.applyTheme(state.theme);
    }

    if (state.fen !== this.currentFen) {
      this.currentFen = state.fen;
      this.rebuildPieces();
    }

    const highlightKey = [
      state.selectedSquare ?? "",
      state.legalTargets.join(","),
      state.hintMove?.from ?? "",
      state.hintMove?.to ?? "",
      state.theme.id,
    ].join("|");

    if (highlightKey !== this.currentHighlightKey) {
      this.currentHighlightKey = highlightKey;
      this.updateHighlights(state);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (!paused) {
      this.startLoop();
    }
  }

  setCameraPreset(preset: "classic" | "side" | "topdown" | "2d"): void {
    void preset;
    // stub — implemented in future ticket
  }

  setAnimationMode(mode: "normal" | "reduced" | "off"): void {
    void mode;
    // stub — implemented in future ticket
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.activePointerId = null;
    this.pointerMaxTravel = 0;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    const { domElement } = this.renderer;
    domElement.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);

    this.disposeHighlights();
    this.pieceGroup.clear();

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    collectMeshResources(this.boardGroup, geometries, materials);
    collectMeshResources(this.hitPlane, geometries, materials);
    this.prototypes.forEach((prototype) => {
      collectMeshResources(prototype, geometries, materials);
    });

    if (this.lightPieceMat) {
      materials.add(this.lightPieceMat);
    }
    if (this.darkPieceMat) {
      materials.add(this.darkPieceMat);
    }
    materials.add(this.eyeMat);
    if (this.feltMat) {
      materials.add(this.feltMat);
    }
    if (this.accentMat) {
      materials.add(this.accentMat);
    }

    disposeCollectedResources(geometries, materials);

    this.boardGroup.clear();
    this.prototypes.clear();
    this.root.remove(this.hitPlane);

    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;

    this.renderer.dispose();
    if (domElement.parentElement === this.container) {
      this.container.removeChild(domElement);
    }
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 900 ? 1.5 : 2));
    this.renderer.setSize(width, height, false);
  }

  private setupLighting(): void {
    const hemi = new HemisphereLight(0xfff5e6, 0x050510, 0.3);
    this.scene.add(hemi);

    const keyLight = new SpotLight(0xffeedd, 500);
    keyLight.position.set(35, 18, 10);
    keyLight.angle = Math.PI / 4;
    keyLight.penumbra = 0.5;
    keyLight.decay = 1.3;
    keyLight.distance = 150;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.005;
    keyLight.shadow.radius = 1.2;
    this.scene.add(keyLight);

    const fillLight = new SpotLight(0xaaccff, 150);
    fillLight.position.set(-20, 25, -20);
    fillLight.angle = Math.PI / 3;
    fillLight.penumbra = 0.8;
    fillLight.decay = 1.2;
    fillLight.distance = 150;
    fillLight.castShadow = false;
    this.scene.add(fillLight);

    const rimLight = new DirectionalLight(0xffffff, 0.8);
    rimLight.position.set(0, 10, -30);
    this.scene.add(rimLight);
  }

  private buildBoard(): void {
    this.lightSquareMats.length = 0;
    this.darkSquareMats.length = 0;
    this.frameMats.length = 0;

    const lightMats: MeshPhysicalMaterial[] = [];
    const darkMats: MeshPhysicalMaterial[] = [];

    this.feltMat = new MeshStandardMaterial({ color: 0x081c0c, roughness: 1.0 });

    for (let i = 0; i < BOARD_TEXTURE_VARIATIONS; i++) {
      const lightMat = new MeshPhysicalMaterial();
      const darkMat = new MeshPhysicalMaterial();

      applyWoodMaterialTheme(
        this.renderer,
        lightMat,
        "lightSquares",
        DEFAULT_BOARD_PALETTE.lightSquares,
        SQUARE_WOOD_MATERIAL,
      );
      applyWoodMaterialTheme(
        this.renderer,
        darkMat,
        "darkSquares",
        DEFAULT_BOARD_PALETTE.darkSquares,
        SQUARE_WOOD_MATERIAL,
      );

      lightMats.push(lightMat);
      darkMats.push(darkMat);
      this.lightSquareMats.push(lightMat);
      this.darkSquareMats.push(darkMat);
    }

    const squareGeo = new RoundedBoxGeometry(0.98, 0.5, 0.98, 6, 0.06);

    for (let col = 0; col < 8; col++) {
      for (let row = 0; row < 8; row++) {
        const isLight = (col + row) % 2 !== 0;
        const poolList = isLight ? lightMats : darkMats;
        const mat = poolList[Math.floor(Math.random() * poolList.length)];

        const square = new Mesh(squareGeo, mat);
        square.position.set(col - 3.5, -0.25, row - 3.5);

        const baseRot = isLight ? 0 : Math.PI / 2;
        const flipRot = Math.floor(Math.random() * 2) * Math.PI;
        square.rotation.y = baseRot + flipRot;

        square.receiveShadow = true;
        square.castShadow = true;
        this.boardGroup.add(square);
      }
    }

    // Grout
    const grout = new Mesh(
      new BoxGeometry(7.9, 0.45, 7.9),
      (this.groutMat = new MeshStandardMaterial({
        color: DEFAULT_BOARD_PALETTE.groutHex,
        roughness: 1.0,
      })),
    );
    grout.position.set(0, -0.25, 0);
    grout.castShadow = true;
    grout.receiveShadow = true;
    this.boardGroup.add(grout);

    const baseMat = new MeshPhysicalMaterial();
    applyWoodMaterialTheme(
      this.renderer,
      baseMat,
      "frame",
      DEFAULT_BOARD_PALETTE.frame,
      FRAME_WOOD_MATERIAL,
    );
    this.frameMats.push(baseMat);

    const border1 = new Mesh(new RoundedBoxGeometry(9.2, 0.3, 9.2, 5, 0.1), baseMat);
    border1.position.set(0, -0.4, 0);
    border1.receiveShadow = true;
    border1.castShadow = true;
    this.boardGroup.add(border1);

    const border2 = new Mesh(new RoundedBoxGeometry(10.4, 0.4, 10.4, 5, 0.15), baseMat);
    border2.position.set(0, -0.7, 0);
    border2.receiveShadow = true;
    border2.castShadow = true;
    this.boardGroup.add(border2);

    const feltPad = new Mesh(
      new RoundedBoxGeometry(11.1, 0.12, 11.1, 6, 0.2),
      this.feltMat,
    );
    feltPad.position.set(0, -0.97, 0);
    feltPad.receiveShadow = true;
    feltPad.castShadow = true;
    this.boardGroup.add(feltPad);

    this.accentMat = new MeshPhysicalMaterial({
      color: 0xd4af37,
      roughness: 0.1,
      metalness: 1.0,
      clearcoat: 0.5,
    });
    const accent = new Mesh(new RoundedBoxGeometry(9.35, 0.12, 9.35, 3, 0.05), this.accentMat);
    accent.position.set(0, -0.35, 0);
    accent.castShadow = true;
    accent.receiveShadow = true;
    this.boardGroup.add(accent);
  }

  private startLoop(): void {
    cancelAnimationFrame(this.animationFrame);
    if (this.disposed || this.paused) {
      return;
    }

    const tick = () => {
      if (this.disposed || this.paused) {
        return;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  private rebuildPieces(): void {
    if (!this.currentState) return;

    this.pieceGroup.clear();
    const pieces = fenToPieces(this.currentState.fen);

    for (const piece of pieces) {
      const prototype = this.prototypes.get(piece.type);
      if (!prototype) continue;

      const clone = prototype.clone(true);
      clone.name = `${piece.color}-${piece.type}-${piece.square}`;
      const { x, z } = squareToCoords(piece.square);
      clone.position.set(x, 0, z);
      clone.scale.setScalar(0.5);

      if (piece.type === "n") {
        clone.rotation.y = piece.color === "b" ? 0 : Math.PI;
      }

      const pieceMat = piece.color === "w" ? this.lightPieceMat : this.darkPieceMat;

      clone.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        if (child.name === "felt") {
          child.material = this.feltMat;
        } else if (child.name === "eye") {
          child.material = this.eyeMat;
        } else {
          child.material = pieceMat;
        }
      });

      this.pieceGroup.add(clone);
    }
  }

  private updateHighlights(state: RenderState): void {
    this.disposeHighlights();

    if (state.selectedSquare) {
      this.highlightGroup.add(
        createHighlight(state.selectedSquare, state.theme.highlightPrimary, 0.46),
      );
    }

    state.legalTargets.forEach((target) => {
      this.highlightGroup.add(
        createHighlight(target, state.theme.highlightSecondary, 0.28),
      );
    });

    if (state.hintMove) {
      this.highlightGroup.add(
        createHighlight(state.hintMove.to, state.theme.highlightPrimary, 0.55, 0.1),
      );
    }
  }

  private applyTheme(theme: ThemeDefinition): void {
    const boardPalette = deriveBoardPalette(theme);

    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.set(theme.canvasFog);
    }
    this.lightSquareMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "lightSquares",
        boardPalette.lightSquares,
        SQUARE_WOOD_MATERIAL,
      ),
    );
    this.darkSquareMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "darkSquares",
        boardPalette.darkSquares,
        SQUARE_WOOD_MATERIAL,
      ),
    );
    this.frameMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "frame",
        boardPalette.frame,
        FRAME_WOOD_MATERIAL,
      ),
    );
    if (this.groutMat) {
      this.groutMat.color.set(boardPalette.groutHex);
    }
    if (this.accentMat) {
      this.accentMat.color.set(theme.canvasAccent);
    }
    if (this.feltMat) {
      this.feltMat.color.set(theme.canvasFelt);
    }
    if (this.lightPieceMat) {
      this.lightPieceMat.color.set(theme.whitePiece);
    }
    if (this.darkPieceMat) {
      this.darkPieceMat.color.set(theme.blackPiece);
    }
    if (this.currentFen) {
      this.rebuildPieces();
    }
  }

  private disposeHighlights(): void {
    disposeObjectResources(this.highlightGroup);
    this.highlightGroup.clear();
  }

  private resolveSquareFromPointerEvent(event: PointerEvent): Square | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObject(this.hitPlane, false);
    if (intersections.length === 0) {
      return null;
    }

    const localPoint = this.root.worldToLocal(intersections[0].point.clone());
    return resolveSquareFromBoardPoint(localPoint.x, localPoint.z);
  }

  private updatePointerTravel(event: PointerEvent): number {
    const deltaX = event.clientX - this.pointerDownPosition.x;
    const deltaY = event.clientY - this.pointerDownPosition.y;
    this.pointerMaxTravel = Math.max(this.pointerMaxTravel, Math.hypot(deltaX, deltaY));
    return this.pointerMaxTravel;
  }

  private resetPointerTracking(): void {
    this.activePointerId = null;
    this.pointerMaxTravel = 0;
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.activePointerId = event.pointerId;
    this.pointerDownPosition.set(event.clientX, event.clientY);
    this.pointerMaxTravel = 0;
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.updatePointerTravel(event);
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const maxTravel = this.updatePointerTravel(event);
    this.resetPointerTracking();
    if (maxTravel > CLICK_THRESHOLD_PX) {
      return;
    }

    const square = this.resolveSquareFromPointerEvent(event);
    if (square) {
      this.onSquareSelect(square);
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    this.resetPointerTracking();
  };
}
