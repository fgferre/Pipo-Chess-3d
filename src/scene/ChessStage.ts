import {
  WebGLRenderer,
  SRGBColorSpace,
  PCFShadowMap,
  ACESFilmicToneMapping,
  BufferGeometry,
  Float32BufferAttribute,
  PerspectiveCamera,
  Scene,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  Color,
  FogExp2,
  SpotLight,
  HemisphereLight,
  PMREMGenerator,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Texture,
  WebGLRenderTarget,
  Sprite,
  SpriteMaterial,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  CircleGeometry,
  LatheGeometry,
  RingGeometry,
  SphereGeometry,
  ExtrudeGeometry,
  Vector2,
  Vector3,
  Raycaster,
  Shape,
  CanvasTexture,
  RepeatWrapping,
  AdditiveBlending,
  MOUSE,
  TOUCH,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { PostProcessingPipeline } from "./PostProcessingPipeline.js";
import {
  clampQualityTier,
  createQualityMonitorState,
  createDefaultQualityPreference,
  createQualityHardwareProbe,
  createTieredMaterial,
  getInitialQualityTier,
  getQualityTierProfile,
  normalizeQualityPreference,
  resolveQualityTier,
  updateQualityMonitorStateForSampleWindow,
  type QualityMonitorState,
  type QualityHardwareProbe,
  type QualityPreference,
  type QualityTier,
  type QualityTierProfile,
} from "./qualityPolicy.js";
import type { SceneAdapter, SceneLoadState } from "./SceneAdapter";
import type { Color as PieceColor, PieceSymbol, Square } from "chess.js";
import type { AppSettings, Orientation, SerializableMove, ThemeDefinition } from "../types/game";
import { fenToPieces, files, squareToCoords, type BoardPiece } from "../utils/board";

const SEGMENTS = 64;
const CLICK_THRESHOLD_PX = 6;
const DRAG_LIFT_Y = 1.1;
const PIECE_SCALE = 0.5;
const RETURN_DURATION_MS = 160;
const LAST_MOVE_HIGHLIGHT_MS = 1800;
const HINT_HIGHLIGHT_MS = 4200;
const STANDARD_BOARD_TEXTURE_VARIATIONS = 2;
const ULTRA_BOARD_TEXTURE_VARIATIONS = 3;
const BASE_FOV = 40;
const MAX_PORTRAIT_FOV = 58;

// Reusable scratch vectors to avoid per-frame allocations in hot paths
const _motionResult = new Vector3();
const _motionControl = new Vector3();
const _motionTail = new Vector3();

const DEFAULT_BOARD_PALETTE = {
  lightSquares: { baseHex: "#e0b576", veinHex: "#a36d26", isKnotty: false },
  darkSquares: { baseHex: "#5c2e16", veinHex: "#1a0b05", isKnotty: true },
  frame: { baseHex: "#361a0d", veinHex: "#0a0402", isKnotty: true },
  groutHex: "#050505",
} satisfies BoardMaterialPalette;

interface HighlightState {
  selectedSquare: Square | null;
  legalTargets: Square[];
  castlingTargets: Square[];
  hintMove: { from: Square; to: Square } | null;
}

interface RenderState extends HighlightState {
  fen: string;
  orientation: Orientation;
  theme: ThemeDefinition;
  playerColor: PieceColor;
  canInteract: boolean;
  lastMove: { from: Square; to: Square } | null;
  moveEntries: SerializableMove[];
  redoStack: SerializableMove[][];
}

type AnimationMode = AppSettings["animationMode"];
type CameraPreset = "classic" | "side" | "topdown" | "2d";
type ViewMode = "3d" | "topdown" | "2d";
type QualityMaterial = MeshStandardMaterial | MeshPhysicalMaterial;

interface TransitionComparableState {
  fen: string;
  moveEntries: SerializableMove[];
  redoStack: SerializableMove[][];
}

type StageTransitionDirection = "forward" | "backward";
type StageTransitionReason = "move" | "undo" | "redo";

interface StageTransitionStep {
  move: SerializableMove;
  direction: StageTransitionDirection;
  reason: StageTransitionReason;
  sourceFen: string;
  targetFen: string;
}

interface StageTransitionBatch {
  kind: "none" | "sync" | "animate";
  steps: StageTransitionStep[];
}

interface MoveTransitionDescriptor {
  move: SerializableMove;
  direction: StageTransitionDirection;
  reason: StageTransitionReason;
  sourceFen: string;
  targetFen: string;
  moverColor: PieceColor;
  moverFrom: Square;
  moverTo: Square;
  moverStartType: PieceSymbol;
  moverEndType: PieceSymbol;
  captureSquare: Square | null;
  capturedPiece: BoardPiece | null;
  rookMove: { from: Square; to: Square } | null;
  isPromotion: boolean;
  isEnPassant: boolean;
}

interface PieceMotionAnimation {
  piece: Group;
  from: Vector3;
  to: Vector3;
  arcHeight: number;
}

interface PieceScaleAnimation {
  piece: Group;
  from: number;
  to: number;
  startProgress: number;
  endProgress: number;
}

interface PieceOpacityAnimation {
  piece: Group;
  from: number;
  to: number;
  startProgress: number;
  endProgress: number;
}

interface ActiveStageTransition {
  descriptor: MoveTransitionDescriptor;
  startedAt: number;
  durationMs: number;
  motions: PieceMotionAnimation[];
  scales: PieceScaleAnimation[];
  opacities: PieceOpacityAnimation[];
  finalize: () => void;
}

interface CaptureParticleBurst {
  points: Points;
  material: PointsMaterial;
  velocities: Vector3[];
  startedAt: number;
  durationMs: number;
}

const ANIMATION_MODE_CONFIG: Record<
  Exclude<AnimationMode, "off">,
  { durationMs: number; arcHeight: number; captureFx: boolean; promotionFx: boolean }
> = {
  normal: {
    durationMs: 300,
    arcHeight: 0.9,
    captureFx: true,
    promotionFx: true,
  },
  reduced: {
    durationMs: 150,
    arcHeight: 0,
    captureFx: false,
    promotionFx: false,
  },
};

const CAMERA_TRANSITION_DURATION_MS: Record<Exclude<AnimationMode, "off">, number> = {
  normal: 520,
  reduced: 220,
};

const CAMERA_PRESET_PROFILES: Record<CameraPreset, CameraPresetProfile> = {
  classic: {
    position: [0, 18.75, 29.5],
    target: [0, 0.35, 0],
    minPolarAngle: 0.55,
    maxPolarAngle: Math.PI / 2 - 0.05,
    minDistance: 8,
    maxDistance: 50,
    enableRotate: true,
    viewMode: "3d",
    pieceOpacity: 1,
    spriteOpacity: 0,
  },
  side: {
    position: [0, 10.75, 33.5],
    target: [0, 0.25, 0],
    minPolarAngle: 1,
    maxPolarAngle: Math.PI / 2 - 0.04,
    minDistance: 12,
    maxDistance: 56,
    enableRotate: true,
    viewMode: "3d",
    pieceOpacity: 1,
    spriteOpacity: 0,
  },
  topdown: {
    position: [0, 32.5, 4.8],
    target: [0, 0, 0],
    minPolarAngle: 0.08,
    maxPolarAngle: 0.38,
    minDistance: 12,
    maxDistance: 58,
    enableRotate: true,
    viewMode: "topdown",
    pieceOpacity: 1,
    spriteOpacity: 0,
  },
  "2d": {
    position: [0, 40, 0.001],
    target: [0, 0, 0],
    minPolarAngle: 0.001,
    maxPolarAngle: 0.001,
    minDistance: 18,
    maxDistance: 60,
    enableRotate: false,
    viewMode: "2d",
    pieceOpacity: 0,
    spriteOpacity: 1,
  },
};

const SPRITE_GLYPHS: Record<PieceColor, Record<PieceSymbol, string>> = {
  w: {
    k: "♔",
    q: "♕",
    r: "♖",
    b: "♗",
    n: "♘",
    p: "♙",
  },
  b: {
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  },
};

const SPRITE_SCALE_BY_TYPE: Record<PieceSymbol, number> = {
  k: 1.62,
  q: 1.52,
  r: 1.4,
  b: 1.42,
  n: 1.45,
  p: 1.24,
};

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
  envMapIntensity: number;
}

interface BoardIntersection {
  square: Square | null;
  localPoint: Vector3;
}

interface AnimatedHighlight {
  mesh: Mesh;
  material: MeshStandardMaterial;
  mode: "static" | "pulse" | "timed";
  baseOpacity: number;
  startedAt: number;
  durationMs?: number;
  phaseOffset?: number;
}

interface DragState {
  pointerId: number;
  sourceSquare: Square;
  piece: Group;
}

interface ReturnAnimation {
  piece: Group;
  from: Vector3;
  to: Vector3;
  startedAt: number;
  durationMs: number;
}

interface CameraPresetProfile {
  position: [number, number, number];
  target: [number, number, number];
  minPolarAngle: number;
  maxPolarAngle: number;
  minDistance: number;
  maxDistance: number;
  enableRotate: boolean;
  viewMode: ViewMode;
  pieceOpacity: number;
  spriteOpacity: number;
}

interface ActiveCameraTransition {
  preset: CameraPreset;
  startedAt: number;
  durationMs: number;
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  fromPieceOpacity: number;
  toPieceOpacity: number;
  fromSpriteOpacity: number;
  toSpriteOpacity: number;
}

type SceneInitListener = (state: SceneLoadState) => void;

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

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
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
  maxAnisotropy = 1,
): CanvasTexture {
  const SIZE = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const centerX = isKnotty ? 600 : -3000;
  const centerY = isKnotty ? 800 : 1024;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Primary grain layer
  for (let r = 10; r < 7000; r += Math.random() * 25 + 15) {
    ctx.beginPath();
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = Math.random() * 0.4 + 0.15;
    ctx.lineWidth = Math.random() * 14 + 6;

    for (let angle = -Math.PI / 2; angle < Math.PI * 1.5; angle += 0.04) {
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

  // Secondary grain layer — offset by 15 degrees for depth
  const cos15 = Math.cos(Math.PI / 12);
  const sin15 = Math.sin(Math.PI / 12);
  for (let r = 30; r < 7000; r += Math.random() * 40 + 28) {
    ctx.beginPath();
    ctx.strokeStyle = veinHex;
    ctx.globalAlpha = Math.random() * 0.18 + 0.05;
    ctx.lineWidth = Math.random() * 7 + 2;

    for (let angle = -Math.PI / 2; angle < Math.PI * 1.5; angle += 0.06) {
      const noise = Math.sin(angle * 5) * 18 + Math.cos(angle * 3) * 14 + Math.sin(r * 0.018 + angle * 2.5) * 38;
      const baseX = centerX + Math.cos(angle) * (r + noise);
      const baseY = centerY + Math.sin(angle) * (r + noise) * (isKnotty ? 1.3 : 3.6);
      // Rotate 15 degrees around center
      const rx = baseX - SIZE / 2;
      const ry = baseY - SIZE / 2;
      const x = rx * cos15 - ry * sin15 + SIZE / 2;
      const y = rx * sin15 + ry * cos15 + SIZE / 2;
      if (angle === -Math.PI / 2) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const grad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.28, SIZE / 2, SIZE / 2, SIZE * 0.76);
  grad.addColorStop(0, "rgba(255,255,255,0.025)");
  grad.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const texture = new CanvasTexture(canvas);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), maxAnisotropy);
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
  material: QualityMaterial,
  role: keyof Omit<BoardMaterialPalette, "groutHex">,
  palette: WoodPalette,
  tuning: WoodMaterialTuning,
  textureAnisotropy: number,
): void {
  const previousTextures = collectMaterialTextures(material);
  const texture = createWoodTexture(
    renderer,
    palette.baseHex,
    palette.veinHex,
    palette.isKnotty,
    textureAnisotropy,
  );

  material.map = texture;
  material.bumpMap = texture;
  material.bumpScale = tuning.bumpScale;
  material.roughness = tuning.roughness;
  material.metalness = tuning.metalness;
  material.envMapIntensity = tuning.envMapIntensity;
  if (material instanceof MeshPhysicalMaterial) {
    material.clearcoat = tuning.clearcoat;
    material.clearcoatRoughness = tuning.clearcoatRoughness;
  }
  material.userData.boardRole = role;
  material.userData.boardPalette = { ...palette };
  material.needsUpdate = true;

  previousTextures.forEach((previousTexture) => previousTexture.dispose());
}

// ─── Piece Prototype Builders ──────────────────────────────────────────────

function createPieceBase(
  material: QualityMaterial,
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

function createPawnPrototype(mat: QualityMaterial): Group {
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

function createRookPrototype(mat: QualityMaterial): Group {
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
  mat: QualityMaterial,
  feltMat: MeshStandardMaterial,
  eyeMat: QualityMaterial,
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

function createBishopPrototype(mat: QualityMaterial): Group {
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

function createQueenPrototype(mat: QualityMaterial): Group {
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

function createKingPrototype(mat: QualityMaterial): Group {
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
  size = 0.9,
): { mesh: Mesh; material: MeshStandardMaterial } {
  const material = new MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    emissive: new Color(color),
    emissiveIntensity: 0.18,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  const { x, z } = squareToCoords(square);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return { mesh, material };
}

function createCoordinateLabelTexture(char: string, color: string): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = `bold 42px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, size / 2, size / 2);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createTargetIndicator(
  square: Square,
  color: string,
  opacity: number,
  occupied: boolean,
): { mesh: Mesh; material: MeshStandardMaterial } {
  const material = new MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    emissive: new Color(color),
    emissiveIntensity: occupied ? 0.28 : 0.18,
  });
  const geometry = occupied
    ? new RingGeometry(0.24, 0.42, 32)
    : new CircleGeometry(0.24, 32);
  const mesh = new Mesh(geometry, material);
  const { x, z } = squareToCoords(square);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.075, z);
  return { mesh, material };
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - clampUnit(progress), 3);
}

function easeInOutCubic(progress: number): number {
  const clamped = clampUnit(progress);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function normalizeWindowProgress(
  progress: number,
  startProgress: number,
  endProgress: number,
): number {
  if (endProgress <= startProgress) {
    return progress >= endProgress ? 1 : 0;
  }

  return clampUnit((progress - startProgress) / (endProgress - startProgress));
}

function moveEquals(left: SerializableMove, right: SerializableMove): boolean {
  return (
    left.uci === right.uci &&
    left.beforeFen === right.beforeFen &&
    left.afterFen === right.afterFen &&
    left.ply === right.ply
  );
}

function moveChunkEquals(left: SerializableMove[], right: SerializableMove[]): boolean {
  return (
    left.length === right.length &&
    left.every((move, index) => moveEquals(move, right[index]))
  );
}

function getSharedMovePrefixLength(left: SerializableMove[], right: SerializableMove[]): number {
  const sharedLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < sharedLength && moveEquals(left[index], right[index])) {
    index += 1;
  }

  return index;
}

function toTransitionComparableState(state: RenderState): TransitionComparableState {
  return {
    fen: state.fen,
    moveEntries: state.moveEntries,
    redoStack: state.redoStack,
  };
}

export function deriveTransitionBatch(
  previous: TransitionComparableState | null,
  next: TransitionComparableState,
): StageTransitionBatch {
  if (!previous) {
    return { kind: "sync", steps: [] };
  }

  if (
    previous.fen === next.fen &&
    previous.moveEntries.length === next.moveEntries.length &&
    previous.redoStack.length === next.redoStack.length
  ) {
    return { kind: "none", steps: [] };
  }

  const sharedPrefix = getSharedMovePrefixLength(previous.moveEntries, next.moveEntries);

  if (
    next.moveEntries.length > previous.moveEntries.length &&
    sharedPrefix === previous.moveEntries.length
  ) {
    const appendedMoves = next.moveEntries.slice(previous.moveEntries.length);
    const redoneChunk = previous.redoStack[0] ?? [];

    if (
      previous.redoStack.length > next.redoStack.length &&
      redoneChunk.length > 0 &&
      moveChunkEquals(appendedMoves, redoneChunk)
    ) {
      return {
        kind: "animate",
        steps: appendedMoves.map((move) => ({
          move,
          direction: "forward",
          reason: "redo",
          sourceFen: move.beforeFen,
          targetFen: move.afterFen,
        })),
      };
    }

    if (appendedMoves.length === 1) {
      return {
        kind: "animate",
        steps: [
          {
            move: appendedMoves[0],
            direction: "forward",
            reason: "move",
            sourceFen: appendedMoves[0].beforeFen,
            targetFen: appendedMoves[0].afterFen,
          },
        ],
      };
    }
  }

  if (
    next.moveEntries.length < previous.moveEntries.length &&
    sharedPrefix === next.moveEntries.length
  ) {
    const removedMoves = previous.moveEntries.slice(next.moveEntries.length);
    const queuedUndoChunk = next.redoStack[0] ?? [];

    if (
      next.redoStack.length > previous.redoStack.length &&
      queuedUndoChunk.length > 0 &&
      moveChunkEquals(removedMoves, queuedUndoChunk)
    ) {
      return {
        kind: "animate",
        steps: removedMoves
          .slice()
          .reverse()
          .map((move) => ({
            move,
            direction: "backward",
            reason: "undo",
            sourceFen: move.afterFen,
            targetFen: move.beforeFen,
          })),
      };
    }
  }

  return { kind: "sync", steps: [] };
}

function findBoardPiece(pieces: BoardPiece[], square: Square): BoardPiece | null {
  return pieces.find((piece) => piece.square === square) ?? null;
}

function getPromotionType(move: SerializableMove, direction: StageTransitionDirection): PieceSymbol {
  if (!move.promotion) {
    return move.piece;
  }

  return direction === "forward" ? move.promotion : move.piece;
}

function getMoverStartType(move: SerializableMove, direction: StageTransitionDirection): PieceSymbol {
  if (direction === "forward") {
    return move.piece;
  }

  return move.promotion ?? move.piece;
}

function getCastlingRookMove(
  move: SerializableMove,
  direction: StageTransitionDirection,
): { from: Square; to: Square } | null {
  if (move.piece !== "k") {
    return null;
  }

  const fileDelta = move.to.charCodeAt(0) - move.from.charCodeAt(0);
  if (Math.abs(fileDelta) !== 2) {
    return null;
  }

  const rank = move.from[1];
  const isKingside = fileDelta > 0;
  const forwardMove = {
    from: `${isKingside ? "h" : "a"}${rank}` as Square,
    to: `${isKingside ? "f" : "d"}${rank}` as Square,
  };

  if (direction === "forward") {
    return forwardMove;
  }

  return {
    from: forwardMove.to,
    to: forwardMove.from,
  };
}

function buildCapturedPieceFallback(
  move: SerializableMove,
  moverColor: PieceColor,
  square: Square,
): BoardPiece {
  return {
    square,
    color: moverColor === "w" ? "b" : "w",
    type: move.captured!,
  };
}

export function describeMoveTransition(step: StageTransitionStep): MoveTransitionDescriptor {
  const sourcePieces = fenToPieces(step.sourceFen);
  const targetPieces = fenToPieces(step.targetFen);
  const moverColor = step.move.color;
  const boardWithCapturedPiece =
    step.direction === "forward" ? sourcePieces : targetPieces;
  const directCapturePiece =
    step.move.captured &&
    findBoardPiece(boardWithCapturedPiece, step.move.to)?.color !== moverColor
      ? findBoardPiece(boardWithCapturedPiece, step.move.to)
      : null;
  const captureSquare = step.move.captured
    ? directCapturePiece
      ? step.move.to
      : `${step.move.to[0]}${step.move.from[1]}` as Square
    : null;
  const capturedPiece =
    step.move.captured && captureSquare
      ? findBoardPiece(boardWithCapturedPiece, captureSquare) ??
        buildCapturedPieceFallback(step.move, moverColor, captureSquare)
      : null;

  return {
    move: step.move,
    direction: step.direction,
    reason: step.reason,
    sourceFen: step.sourceFen,
    targetFen: step.targetFen,
    moverColor,
    moverFrom: step.direction === "forward" ? step.move.from : step.move.to,
    moverTo: step.direction === "forward" ? step.move.to : step.move.from,
    moverStartType: getMoverStartType(step.move, step.direction),
    moverEndType: getPromotionType(step.move, step.direction),
    captureSquare,
    capturedPiece,
    rookMove: getCastlingRookMove(step.move, step.direction),
    isPromotion: !!step.move.promotion,
    isEnPassant: !!step.move.captured && captureSquare !== null && captureSquare !== step.move.to,
  };
}

function createVector3FromTuple([x, y, z]: [number, number, number]): Vector3 {
  return new Vector3(x, y, z);
}

function getCameraPresetProfile(preset: CameraPreset): CameraPresetProfile {
  return CAMERA_PRESET_PROFILES[preset];
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

export class ChessStage implements SceneAdapter {
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
  private readonly coordinateGroup = new Group();
  private readonly pieceGroup = new Group();
  private readonly spriteGroup = new Group();
  private readonly highlightGroup = new Group();
  private readonly hitPlane = new Mesh(
    new PlaneGeometry(8, 8),
    new MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  private readonly lightSquareMats: QualityMaterial[] = [];
  private readonly darkSquareMats: QualityMaterial[] = [];
  private readonly frameMats: QualityMaterial[] = [];
  private readonly prototypes = new Map<string, Group>();
  private readonly spriteTextures = new Map<string, Texture>();
  private readonly resizeObserver: ResizeObserver;
  private readonly eyeMat: QualityMaterial;
  private readonly handlePreventRightClick = (event: PointerEvent): void => {
    if (event.button === 2) {
      event.preventDefault();
    }
  };
  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
  // Initialized in buildBoard() / init() before first use
  private lightPieceMat!: QualityMaterial;
  private darkPieceMat!: QualityMaterial;
  private feltMat!: MeshStandardMaterial;
  private accentMat!: QualityMaterial;
  private groutMat!: MeshStandardMaterial;
  private environmentTarget: WebGLRenderTarget | null = null;
  private pipeline: PostProcessingPipeline | null = null;
  private qualityPreference: QualityPreference = createDefaultQualityPreference();
  private qualityDetectedTier: QualityTier = 2;
  private qualityTier: QualityTier = 2;
  private qualityProfile: QualityTierProfile = getQualityTierProfile(2);
  private qualityLastFrameAt = 0;
  private qualitySampleWindowMs = 0;
  private qualitySampleFrames = 0;
  private qualityMonitorState: QualityMonitorState = createQualityMonitorState();
  private initialized = false;
  private keyLight: SpotLight | null = null;
  private leftRimLight: SpotLight | null = null;
  private rightRimLight: SpotLight | null = null;
  private hemisphereLight: HemisphereLight | null = null;
  private activeCaptureParticles: CaptureParticleBurst[] = [];
  private animationFrame = 0;
  private disposed = false;
  private paused = false;
  private activeCameraTransition: ActiveCameraTransition | null = null;
  private cameraPreset: CameraPreset = "classic";
  private viewMode: ViewMode = "3d";
  private cameraSensitivity: AppSettings["cameraSensitivity"] = { rotate: 1, zoom: 1 };
  private pieceRepresentationOpacity = 1;
  private spriteRepresentationOpacity = 0;
  private activePointerId: number | null = null;
  private readonly touchPointerIds = new Set<number>();
  private multiTouchGesture = false;
  private animationMode: AnimationMode = "normal";
  private pointerMaxTravel = 0;
  private pointerDownOwnPieceSquare: Square | null = null;
  private dragState: DragState | null = null;
  private returnAnimation: ReturnAnimation | null = null;
  private activeStageTransition: ActiveStageTransition | null = null;
  private readonly transitionQueue: StageTransitionStep[] = [];
  private readonly pieceBySquare = new Map<Square, Group>();
  private animatedHighlights: AnimatedHighlight[] = [];
  private selectedPiece: Group | null = null;
  private readonly selectedPieceHighlightMaterials: Material[] = [];
  private currentFen = "";
  private currentThemeId = "";
  private currentOrientation: Orientation = "white";
  private coordinatesVisible = false;
  private currentHighlightKey = "";
  private currentState: RenderState | null = null;
  private transitionStateCursor: TransitionComparableState | null = null;
  private activeHintKey = "";
  private suppressedHintKey = "";
  private hintAnimationStartedAt = 0;
  private activeLastMoveKey = "";
  private lastMoveAnimationStartedAt = 0;
  private needsRender = true;
  private onBeforeRender: (() => void) | null = null;

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
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.domElement.className = "board-canvas";
    this.container.appendChild(this.renderer.domElement);

    const aspect = container.clientWidth / Math.max(container.clientHeight, 1);
    this.camera = new PerspectiveCamera(40, aspect, 0.1, 1000);
    this.camera.position.set(0, 18.75, 29.5);
    this.camera.lookAt(0, 0.35, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 50;
    this.controls.mouseButtons.LEFT = null;
    this.controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    this.controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    this.controls.touches.ONE = null;
    this.controls.touches.TWO = TOUCH.DOLLY_ROTATE;
    this.applyCameraSensitivity(this.cameraSensitivity);
    this.controls.addEventListener("change", this.handleControlsChange);

    this.scene.fog = new FogExp2(0x05070b, 0.0095);

    this.scene.add(this.root);
    this.root.add(this.boardGroup, this.pieceGroup, this.spriteGroup, this.highlightGroup);
    this.spriteGroup.renderOrder = 4;

    this.hitPlane.rotation.x = -Math.PI / 2;
    this.hitPlane.position.y = 0.03;
    this.root.add(this.hitPlane);

    this.eyeMat = new MeshPhysicalMaterial({
      color: 0x050505,
      roughness: 0.1,
      clearcoat: 0.5,
    });

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerdown", this.handlePreventRightClick);
    window.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerCancel);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.applyCameraPresetState("classic");
    this.resize();
  }

  async init(onLoadStateChange?: SceneInitListener): Promise<void> {
    const probe = this.getHardwareProbe();
    this.qualityDetectedTier = getInitialQualityTier(probe);
    this.qualityTier = resolveQualityTier(this.qualityPreference, this.qualityDetectedTier);
    this.qualityProfile = getQualityTierProfile(this.qualityTier);
    this.applyQualityRuntimeSettings();

    if (this.initialized) {
      onLoadStateChange?.({
        phase: "ready",
        progress: 100,
        messageKey: "scene.loading.ready",
      });
      return;
    }

    try {
      await this.reportInitProgress(onLoadStateChange, 12, "scene.loading.renderer");
      if (this.disposed) {
        return;
      }

      await this.reportInitProgress(onLoadStateChange, 24, "scene.loading.environment");
      if (this.disposed) {
        return;
      }

      const pmremGenerator = new PMREMGenerator(this.renderer);
      this.environmentTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.008);
      this.scene.environment = this.environmentTarget.texture;
      pmremGenerator.dispose();

      this.setupLighting();
      await this.reportInitProgress(onLoadStateChange, 40, "scene.loading.materials");
      if (this.disposed) {
        return;
      }

      await this.buildBoardProgressively(onLoadStateChange);
      if (this.disposed) {
        return;
      }

      await this.reportInitProgress(onLoadStateChange, 82, "scene.loading.pieces");
      if (this.disposed) {
        return;
      }

      this.buildPiecePrototypes();

      await this.reportInitProgress(onLoadStateChange, 94, "scene.loading.post");
      if (this.disposed) {
        return;
      }

      this.pipeline = new PostProcessingPipeline(this.renderer, this.scene, this.camera);
      this.applyQualityRuntimeSettings();
      this.initialized = true;
      this.resetPerformanceMonitor();

      if (this.currentState) {
        const pendingState = this.currentState;
        this.currentFen = "";
        this.currentThemeId = "";
        this.currentHighlightKey = "";
        this.activeHintKey = "";
        this.suppressedHintKey = "";
        this.hintAnimationStartedAt = 0;
        this.activeLastMoveKey = "";
        this.lastMoveAnimationStartedAt = 0;
        this.transitionStateCursor = null;
        this.update(pendingState);
      }

      onLoadStateChange?.({
        phase: "ready",
        progress: 100,
        messageKey: "scene.loading.ready",
      });

      this.startLoop();
    } catch (error) {
      onLoadStateChange?.({
        phase: "error",
        progress: 100,
        messageKey: "scene.loading.error",
      });
      throw error;
    }
  }

  private markDirty(): void {
    this.needsRender = true;
  }

  private handleControlsChange = (): void => {
    this.markDirty();
  };

  setOnBeforeRender(callback: (() => void) | null): void {
    this.onBeforeRender = callback;
  }

  private applyCameraPresetState(preset: CameraPreset): void {
    const profile = getCameraPresetProfile(preset);
    this.cameraPreset = preset;
    this.viewMode = profile.viewMode;
    this.activeCameraTransition = null;
    this.camera.position.copy(createVector3FromTuple(profile.position));
    this.controls.target.copy(createVector3FromTuple(profile.target));
    this.camera.lookAt(this.controls.target);
    this.applyControlProfile(profile);
    this.setRepresentationBlend(profile.pieceOpacity, profile.spriteOpacity);
    this.controls.enabled = true;
    this.markDirty();
  }

  private applyControlProfile(profile: CameraPresetProfile): void {
    this.controls.minPolarAngle = profile.minPolarAngle;
    this.controls.maxPolarAngle = profile.maxPolarAngle;
    this.controls.minDistance = profile.minDistance;
    this.controls.maxDistance = profile.maxDistance;
    this.controls.enableRotate = profile.enableRotate;
    this.controls.update();
  }

  private updateCameraTransition(now: number): void {
    if (!this.activeCameraTransition) {
      return;
    }

    const transition = this.activeCameraTransition;
    const progress = easeInOutCubic(
      clampUnit((now - transition.startedAt) / transition.durationMs),
    );

    this.camera.position.lerpVectors(transition.fromPosition, transition.toPosition, progress);
    this.controls.target.lerpVectors(transition.fromTarget, transition.toTarget, progress);
    this.camera.lookAt(this.controls.target);
    this.setRepresentationBlend(
      lerp(transition.fromPieceOpacity, transition.toPieceOpacity, progress),
      lerp(transition.fromSpriteOpacity, transition.toSpriteOpacity, progress),
    );

    if (progress >= 1) {
      this.applyCameraPresetState(transition.preset);
    }
  }

  private setRepresentationBlend(pieceOpacity: number, spriteOpacity: number): void {
    this.pieceRepresentationOpacity = pieceOpacity;
    this.spriteRepresentationOpacity = spriteOpacity;
    this.pieceBySquare.forEach((piece) => {
      this.setPieceOpacity(piece, piece.userData.effectOpacity ?? 1);
    });
    this.syncSpriteVisuals();
  }

  private createPieceSprite(piece: BoardPiece): Sprite {
    const material = new SpriteMaterial({
      map: this.getOrCreateSpriteTexture(piece.color, piece.type),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.renderOrder = 5;
    sprite.userData.type = piece.type;
    sprite.userData.color = piece.color;
    sprite.userData.square = piece.square;
    return sprite;
  }

  private getOrCreateSpriteTexture(color: PieceColor, type: PieceSymbol): Texture {
    const key = `${color}-${type}`;
    const existing = this.spriteTextures.get(key);
    if (existing) {
      return existing;
    }

    // Placeholder sprite provider: swap this generator for local image assets later
    // without touching camera, interaction, or piece-transition code.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not create a 2D sprite context.");
    }

    const glyph = SPRITE_GLYPHS[color][type];
    ctx.clearRect(0, 0, 256, 256);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.font = "190px Georgia, 'Times New Roman', serif";
    ctx.lineWidth = color === "w" ? 20 : 18;
    ctx.strokeStyle = color === "w" ? "rgba(72, 42, 10, 0.95)" : "rgba(250, 240, 224, 0.9)";
    ctx.fillStyle = color === "w" ? "#f8efe2" : "#1e1711";
    ctx.strokeText(glyph, 128, 140);
    ctx.fillText(glyph, 128, 140);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.spriteTextures.set(key, texture);
    return texture;
  }

  private clearSprites(): void {
    for (const child of [...this.spriteGroup.children]) {
      if (!(child instanceof Sprite)) {
        continue;
      }

      if (child.material instanceof Material) {
        child.material.dispose();
      }
      this.spriteGroup.remove(child);
    }
  }

  private removePieceSprite(piece: Group): void {
    const sprite = piece.userData.sprite;
    if (!(sprite instanceof Sprite)) {
      return;
    }

    if (sprite.material instanceof Material) {
      sprite.material.dispose();
    }
    this.spriteGroup.remove(sprite);
    delete piece.userData.sprite;
  }

  private syncSpriteVisuals(): void {
    this.pieceBySquare.forEach((piece) => {
      const sprite = piece.userData.sprite;
      if (!(sprite instanceof Sprite) || !(sprite.material instanceof SpriteMaterial)) {
        return;
      }

      const spriteScaleBase = piece.userData.spriteBaseScale ?? 1.3;
      const scaleFactor = piece.scale.x / PIECE_SCALE;
      const isSelected = this.currentState?.selectedSquare === piece.userData.square;
      sprite.position.set(piece.position.x, 0.18, piece.position.z);
      sprite.scale.setScalar(spriteScaleBase * scaleFactor * (isSelected ? 1.08 : 1));
      sprite.material.opacity =
        (piece.visible ? 1 : 0) *
        this.spriteRepresentationOpacity *
        (piece.userData.effectOpacity ?? 1);
      sprite.visible = sprite.material.opacity > 0.01;
    });
  }

  update(state: RenderState): void {
    const nextTransitionState = toTransitionComparableState(state);
    this.currentState = state;

    if (!this.initialized) {
      this.transitionStateCursor = nextTransitionState;
      this.currentOrientation = state.orientation;
      this.root.rotation.y = state.orientation === "black" ? Math.PI : 0;
      this.markDirty();
      return;
    }

    const previousTransitionState = this.transitionStateCursor;
    this.transitionStateCursor = nextTransitionState;

    if (state.orientation !== this.currentOrientation) {
      this.currentOrientation = state.orientation;
      this.root.rotation.y = state.orientation === "black" ? Math.PI : 0;
      if (this.coordinatesVisible) {
        this.buildCoordinateLabels(state.orientation);
      }
    }

    const hintKey = state.hintMove ? `${state.hintMove.from}-${state.hintMove.to}` : "";
    if (hintKey !== this.activeHintKey) {
      this.activeHintKey = hintKey;
      this.hintAnimationStartedAt = hintKey ? performance.now() : 0;
      this.suppressedHintKey = "";
    }

    const lastMoveKey = state.lastMove ? `${state.lastMove.from}-${state.lastMove.to}` : "";
    if (lastMoveKey !== this.activeLastMoveKey) {
      this.activeLastMoveKey = lastMoveKey;
      this.lastMoveAnimationStartedAt = lastMoveKey ? performance.now() : 0;
    }

    if (state.theme.id !== this.currentThemeId) {
      this.currentThemeId = state.theme.id;
      this.applyTheme(state.theme);
    }

    if (state.fen !== this.currentFen) {
      const transitionBatch =
        this.animationMode === "off"
          ? { kind: "sync", steps: [] as StageTransitionStep[] }
          : deriveTransitionBatch(previousTransitionState, this.transitionStateCursor);
      this.currentFen = state.fen;

      if (transitionBatch.kind === "animate") {
        this.enqueueTransitions(transitionBatch.steps);
      } else if (transitionBatch.kind === "sync") {
        this.syncPiecesToCurrentState();
      }
    }

    const highlightKey = [
      state.selectedSquare ?? "",
      state.legalTargets.join(","),
      (state.castlingTargets ?? []).join(","),
      state.hintMove?.from ?? "",
      state.hintMove?.to ?? "",
      state.lastMove?.from ?? "",
      state.lastMove?.to ?? "",
      state.theme.id,
      this.suppressedHintKey,
    ].join("|");

    if (highlightKey !== this.currentHighlightKey) {
      this.currentHighlightKey = highlightKey;
      this.updateHighlights(state);
    }

    this.markDirty();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.resetPerformanceMonitor();
    if (!paused) {
      this.needsRender = true;
      this.startLoop();
    }
  }

  setQualityPreference(preference: QualityPreference): void {
    const nextPreference = normalizeQualityPreference(preference);
    if (
      this.qualityPreference.qualityMode === nextPreference.qualityMode &&
      this.qualityPreference.manualQualityTier === nextPreference.manualQualityTier
    ) {
      return;
    }

    this.qualityPreference = nextPreference;
    if (!this.initialized) {
      return;
    }

    const nextTier = resolveQualityTier(this.qualityPreference, this.qualityDetectedTier);
    this.applyQualityTier(nextTier, {
      rebuildScene: nextTier !== this.qualityTier,
    });
  }

  setQualityTier(tier: QualityTier): void {
    this.setQualityPreference({
      qualityMode: "manual",
      manualQualityTier: clampQualityTier(tier),
    });
  }

  setCameraPreset(preset: CameraPreset): void {
    const profile = getCameraPresetProfile(preset);
    if (
      this.cameraPreset === preset &&
      this.viewMode === profile.viewMode &&
      this.activeCameraTransition === null
    ) {
      return;
    }

    this.viewMode = profile.viewMode;

    if (this.animationMode === "off") {
      this.applyCameraPresetState(preset);
      return;
    }

    const durationMs = CAMERA_TRANSITION_DURATION_MS[this.animationMode];
    this.activeCameraTransition = {
      preset,
      startedAt: performance.now(),
      durationMs,
      fromPosition: this.camera.position.clone(),
      toPosition: createVector3FromTuple(profile.position),
      fromTarget: this.controls.target.clone(),
      toTarget: createVector3FromTuple(profile.target),
      fromPieceOpacity: this.pieceRepresentationOpacity,
      toPieceOpacity: profile.pieceOpacity,
      fromSpriteOpacity: this.spriteRepresentationOpacity,
      toSpriteOpacity: profile.spriteOpacity,
    };
    this.controls.enabled = false;
    this.markDirty();
  }

  setCameraSensitivity(sensitivity: AppSettings["cameraSensitivity"]): void {
    if (
      this.cameraSensitivity.rotate === sensitivity.rotate &&
      this.cameraSensitivity.zoom === sensitivity.zoom
    ) {
      return;
    }

    this.cameraSensitivity = { ...sensitivity };
    this.applyCameraSensitivity(this.cameraSensitivity);
    this.markDirty();
  }

  projectSquareToViewport(square: Square, yOffset = 0): { x: number; y: number } | null {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return null;
    }

    this.root.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    const point = this.root.localToWorld(this.createSquareVector(square, yOffset));
    point.project(this.camera);

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }

    return {
      x: ((point.x + 1) / 2) * width,
      y: ((1 - point.y) / 2) * height,
    };
  }

  setBloomStrength(strength: number): void {
    this.pipeline?.setBloomStrength(strength);
    this.markDirty();
  }

  setAnimationMode(mode: "normal" | "reduced" | "off"): void {
    this.animationMode = mode;
    if (mode === "off") {
      if (this.activeCameraTransition) {
        this.applyCameraPresetState(this.activeCameraTransition.preset);
      }
      this.syncPiecesToCurrentState();
    }
    this.markDirty();
  }

  private applyQualityTier(
    tier: QualityTier,
    options: { rebuildScene?: boolean } = {},
  ): void {
    this.qualityTier = clampQualityTier(tier);
    this.qualityProfile = getQualityTierProfile(this.qualityTier);
    this.applyQualityRuntimeSettings();

    if (options.rebuildScene && this.initialized) {
      this.rebuildQualitySensitiveScene();
    }

    this.resetPerformanceMonitor();
    this.resize();
    this.markDirty();
  }

  private applyQualityRuntimeSettings(): void {
    this.renderer.shadowMap.enabled = this.qualityProfile.shadowMapEnabled;
    this.renderer.shadowMap.type = PCFShadowMap;

    const profile = this.qualityProfile;
    const shadowSize = profile.shadowMapSize;

    for (const light of [this.keyLight, this.leftRimLight]) {
      if (!light) {
        continue;
      }

      light.castShadow = profile.shadowMapEnabled;
      if (profile.shadowMapEnabled && shadowSize > 0) {
        light.shadow.mapSize.width = shadowSize;
        light.shadow.mapSize.height = shadowSize;
      }
    }

    if (this.keyLight) {
      this.keyLight.shadow.radius = profile.shadowRadiusPrimary;
    }
    if (this.leftRimLight) {
      this.leftRimLight.shadow.radius = profile.shadowRadiusRim;
    }
    if (this.rightRimLight) {
      this.rightRimLight.castShadow = false;
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.intensity = profile.hemisphereIntensity;
    }

    this.pipeline?.setAntiAliasing(profile.postProcessSamples, profile.postProcessFxaa);
    this.pipeline?.setEnabled(profile.bloomEnabled);
    this.pipeline?.setBloomResolutionScale(profile.bloomResolutionScale);
  }

  private rebuildQualitySensitiveScene(): void {
    const currentState = this.currentState;

    this.clearDragState();
    this.returnAnimation = null;
    this.activeCameraTransition = null;
    this.activeStageTransition = null;
    this.transitionQueue.length = 0;
    this.clearSelectedPieceHighlight();
    this.disposeHighlights();
    this.clearPieceEffectMaterials(this.pieceGroup);
    this.clearSprites();

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    collectMeshResources(this.boardGroup, geometries, materials);
    collectMeshResources(this.pieceGroup, geometries, materials);
    this.prototypes.forEach((prototype) => {
      collectMeshResources(prototype, geometries, materials);
    });

    this.pieceBySquare.clear();
    this.pieceGroup.clear();
    this.boardGroup.clear();
    this.prototypes.clear();
    disposeCollectedResources(geometries, materials);

    this.buildBoard();
    this.buildPiecePrototypes();
    this.applyQualityRuntimeSettings();

    if (currentState) {
      this.currentHighlightKey = "";
      this.applyTheme(currentState.theme);
      this.updateHighlights(currentState);
    }
  }

  private getHardwareProbe(): QualityHardwareProbe {
    const gl = this.renderer.getContext();
    let rendererName: string | null = null;
    let vendorName: string | null = null;

    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as
        | {
            UNMASKED_RENDERER_WEBGL: number;
            UNMASKED_VENDOR_WEBGL: number;
          }
        | null;

      if (debugInfo) {
        rendererName = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        vendorName = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
      } else {
        rendererName = String(gl.getParameter(gl.RENDERER));
        vendorName = String(gl.getParameter(gl.VENDOR));
      }
    }

    const navigatorWithMemory = navigator as Navigator & {
      deviceMemory?: number;
      hardwareConcurrency?: number;
    };

    return createQualityHardwareProbe(
      rendererName,
      vendorName,
      typeof navigatorWithMemory.deviceMemory === "number" ? navigatorWithMemory.deviceMemory : null,
      typeof navigatorWithMemory.hardwareConcurrency === "number"
        ? navigatorWithMemory.hardwareConcurrency
        : null,
      (window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
        navigator.maxTouchPoints > 0 ||
        /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent),
    );
  }

  private resetPerformanceMonitor(timestamp = performance.now()): void {
    this.qualityLastFrameAt = timestamp;
    this.qualitySampleWindowMs = 0;
    this.qualitySampleFrames = 0;
    this.qualityMonitorState = {
      ...this.qualityMonitorState,
      lowFpsSinceMs: null,
    };
  }

  private updatePerformanceMonitor(now: number): void {
    if (
      this.paused ||
      this.disposed ||
      document.hidden ||
      this.qualityPreference.qualityMode === "manual"
    ) {
      this.resetPerformanceMonitor(now);
      return;
    }

    if (this.qualityLastFrameAt === 0) {
      this.resetPerformanceMonitor(now);
      return;
    }

    const delta = Math.max(0, now - this.qualityLastFrameAt);
    this.qualityLastFrameAt = now;
    this.qualitySampleWindowMs += delta;
    this.qualitySampleFrames += 1;

    if (this.qualitySampleWindowMs < 1000) {
      return;
    }

    const fps = (this.qualitySampleFrames * 1000) / Math.max(1, this.qualitySampleWindowMs);
    const qualityUpdate = updateQualityMonitorStateForSampleWindow(this.qualityMonitorState, {
      currentTier: this.qualityTier,
      fps,
      nowMs: now,
      sampleWindowMs: this.qualitySampleWindowMs,
    });
    this.qualityMonitorState = qualityUpdate.nextState;

    if (qualityUpdate.nextTier !== null && qualityUpdate.nextTier !== this.qualityTier) {
      this.applyQualityTier(qualityUpdate.nextTier, { rebuildScene: this.initialized });
    }

    this.qualitySampleWindowMs = 0;
    this.qualitySampleFrames = 0;
  }

  private applyCameraSensitivity(sensitivity: AppSettings["cameraSensitivity"]): void {
    this.controls.rotateSpeed = sensitivity.rotate;
    this.controls.zoomSpeed = sensitivity.zoom;
  }

  setShowCoordinates(show: boolean): void {
    if (show === this.coordinatesVisible) return;
    this.coordinatesVisible = show;
    if (show) {
      this.buildCoordinateLabels(this.currentOrientation);
    } else {
      this.disposeCoordinateLabels();
    }
    this.markDirty();
  }

  private buildCoordinateLabels(orientation: Orientation): void {
    this.disposeCoordinateLabels();

    const palette = this.currentState?.theme
      ? deriveBoardPalette(this.currentState.theme)
      : DEFAULT_BOARD_PALETTE;
    const textColor = palette.lightSquares.baseHex;

    const isBlack = orientation === "black";
    const fileLetters = isBlack
      ? ["h", "g", "f", "e", "d", "c", "b", "a"]
      : ["a", "b", "c", "d", "e", "f", "g", "h"];
    const rankNumbers = isBlack
      ? ["8", "7", "6", "5", "4", "3", "2", "1"]
      : ["1", "2", "3", "4", "5", "6", "7", "8"];

    const LABEL_HEIGHT = 0.045;
    const geo = new BoxGeometry(0.45, LABEL_HEIGHT, 0.45);
    const sideMat = new MeshStandardMaterial({
      color: new Color(palette.frame.baseHex),
      roughness: 0.85,
      metalness: 0.0,
    });

    const createLabelMesh = (char: string, x: number, z: number, rotZ: number): Mesh => {
      const texture = createCoordinateLabelTexture(char, textColor);
      const topMat = new MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 0.82,
        emissive: new Color(textColor),
        emissiveIntensity: 0.12,
        roughness: 0.6,
      });
      // BoxGeometry face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
      const mesh = new Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
      mesh.rotation.y = rotZ;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, LABEL_HEIGHT / 2, z);
      return mesh;
    };

    // File labels (a-h) along bottom and top edges
    // The root rotates by PI for black, so labels are placed at fixed positions
    // and the text content is swapped based on orientation.
    for (let i = 0; i < 8; i++) {
      const x = i - 3.5;
      // Bottom edge (near white side when orientation=white)
      this.coordinateGroup.add(createLabelMesh(fileLetters[i], x, 4.3, 0));
      // Top edge — rotate text by PI so it reads correctly from the other side
      this.coordinateGroup.add(createLabelMesh(fileLetters[i], x, -4.3, Math.PI));
    }

    // Rank labels (1-8) along left and right edges
    for (let i = 0; i < 8; i++) {
      const z = 3.5 - i;
      // Left edge
      this.coordinateGroup.add(createLabelMesh(rankNumbers[i], -4.3, z, Math.PI / 2));
      // Right edge — rotate text so it reads correctly from the other side
      this.coordinateGroup.add(createLabelMesh(rankNumbers[i], 4.3, z, -Math.PI / 2));
    }
  }

  private disposeCoordinateLabels(): void {
    const disposedMats = new Set<Material>();
    while (this.coordinateGroup.children.length > 0) {
      const child = this.coordinateGroup.children[0];
      this.coordinateGroup.remove(child);
      if (child instanceof Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (disposedMats.has(mat)) continue;
          disposedMats.add(mat);
          if (mat instanceof MeshStandardMaterial) {
            mat.map?.dispose();
            mat.dispose();
          }
        }
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.disposeCoordinateLabels();
    this.touchPointerIds.clear();
    this.multiTouchGesture = false;
    this.clearDragState();
    this.returnAnimation = null;
    this.activeCameraTransition = null;
    this.activeStageTransition = null;
    this.transitionQueue.length = 0;
    this.clearSelectedPieceHighlight();
    this.resetPointerTracking();
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.handleControlsChange);
    this.controls.dispose();
    const { domElement } = this.renderer;
    domElement.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerdown", this.handlePreventRightClick);
    window.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerCancel);

    this.disposeHighlights();
    this.clearPieceEffectMaterials(this.pieceGroup);
    this.clearSprites();
    this.pieceBySquare.clear();
    this.pieceGroup.clear();
    this.spriteTextures.forEach((texture) => texture.dispose());
    this.spriteTextures.clear();

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

    for (const burst of this.activeCaptureParticles) {
      this.root.remove(burst.points);
      burst.points.geometry.dispose();
      burst.material.dispose();
    }
    this.activeCaptureParticles.length = 0;

    this.pipeline?.dispose();
    this.pipeline = null;

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

    const pixelRatio = Math.min(window.devicePixelRatio, this.qualityProfile.pixelRatioCap);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.pipeline?.setSize(width, height, pixelRatio);
    this.updateCameraFov();
    this.markDirty();
  }

  private updateCameraFov(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }

    const aspect = width / height;
    this.camera.fov = aspect < 1
      ? Math.min(BASE_FOV / aspect, MAX_PORTRAIT_FOV)
      : BASE_FOV;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private setupLighting(): void {
    // Obsidian stage rig: warm key light, cool cyan rim, restrained fill.
    this.keyLight = new SpotLight(0xf4eadc, 44);
    this.keyLight.position.set(18, 26, 14);
    this.keyLight.angle = Math.PI / 4.6;
    this.keyLight.penumbra = 0.96;
    this.keyLight.decay = 2.2;
    this.keyLight.distance = 165;
    this.keyLight.castShadow = true;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.bias = -0.0001;
    this.keyLight.shadow.normalBias = 0.002;
    this.scene.add(this.keyLight);

    this.leftRimLight = new SpotLight(0x8de8ff, 18);
    this.leftRimLight.position.set(-20, 14, -28);
    this.leftRimLight.angle = Math.PI / 3.15;
    this.leftRimLight.penumbra = 1.0;
    this.leftRimLight.decay = 2.0;
    this.leftRimLight.distance = 140;
    this.leftRimLight.castShadow = true;
    this.leftRimLight.shadow.bias = -0.0005;
    this.scene.add(this.leftRimLight);

    this.rightRimLight = new SpotLight(0xffc585, 9);
    this.rightRimLight.position.set(24, 10, -18);
    this.rightRimLight.angle = Math.PI / 3.9;
    this.rightRimLight.penumbra = 1.0;
    this.rightRimLight.decay = 2.0;
    this.rightRimLight.distance = 130;
    this.rightRimLight.castShadow = false;
    this.scene.add(this.rightRimLight);

    this.hemisphereLight = new HemisphereLight(0x182734, 0x020304, 0.58);
    this.scene.add(this.hemisphereLight);

    this.applyQualityRuntimeSettings();
  }

  private buildBoard(): void {
    const { lightMats, darkMats } = this.createBoardMaterialPools();
    const variationCount = this.getBoardTextureVariationCount();

    for (let i = 0; i < variationCount; i++) {
      this.createBoardMaterialVariant(lightMats, darkMats);
    }

    this.populateBoardGeometry(lightMats, darkMats);
  }

  private buildPiecePrototypes(): void {
    this.prototypes.clear();
    this.lightPieceMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0x5a544d,
      this.qualityProfile.pieceWhite,
    );
    this.darkPieceMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0x010101,
      this.qualityProfile.pieceBlack,
    );

    this.prototypes.set("p", createPawnPrototype(this.lightPieceMat));
    this.prototypes.set("r", createRookPrototype(this.lightPieceMat));
    this.prototypes.set("n", createKnightPrototype(this.lightPieceMat, this.feltMat, this.eyeMat));
    this.prototypes.set("b", createBishopPrototype(this.lightPieceMat));
    this.prototypes.set("q", createQueenPrototype(this.lightPieceMat));
    this.prototypes.set("k", createKingPrototype(this.lightPieceMat));
  }

  private async reportInitProgress(
    onLoadStateChange: SceneInitListener | undefined,
    progress: number,
    messageKey: SceneLoadState["messageKey"],
  ): Promise<void> {
    onLoadStateChange?.({
      phase: "loading",
      progress,
      messageKey,
    });
    await yieldToMainThread();
  }

  private async buildBoardProgressively(onLoadStateChange?: SceneInitListener): Promise<void> {
    const { lightMats, darkMats } = this.createBoardMaterialPools();
    const variationCount = this.getBoardTextureVariationCount();

    for (let i = 0; i < variationCount; i++) {
      this.createBoardMaterialVariant(lightMats, darkMats);
      await this.reportInitProgress(
        onLoadStateChange,
        44 + Math.round(((i + 1) / variationCount) * 24),
        "scene.loading.materials",
      );
      if (this.disposed) {
        return;
      }
    }

    await this.reportInitProgress(onLoadStateChange, 72, "scene.loading.board");
    if (this.disposed) {
      return;
    }

    this.populateBoardGeometry(lightMats, darkMats);
  }

  private createBoardMaterialPools(): { lightMats: QualityMaterial[]; darkMats: QualityMaterial[] } {
    this.lightSquareMats.length = 0;
    this.darkSquareMats.length = 0;
    this.frameMats.length = 0;

    this.feltMat = new MeshStandardMaterial({ color: 0x081c0c, roughness: 1.0 });

    return {
      lightMats: [],
      darkMats: [],
    };
  }

  private getBoardTextureVariationCount(): number {
    return this.qualityTier >= 3 ? ULTRA_BOARD_TEXTURE_VARIATIONS : STANDARD_BOARD_TEXTURE_VARIATIONS;
  }

  private createBoardMaterialVariant(
    lightMats: QualityMaterial[],
    darkMats: QualityMaterial[],
  ): void {
    const lightMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0xffffff,
      this.qualityProfile.boardLight,
    );
    const darkMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0xffffff,
      this.qualityProfile.boardDark,
    );

    applyWoodMaterialTheme(
      this.renderer,
      lightMat,
      "lightSquares",
      DEFAULT_BOARD_PALETTE.lightSquares,
      this.qualityProfile.boardLight,
      this.qualityProfile.textureAnisotropy,
    );
    applyWoodMaterialTheme(
      this.renderer,
      darkMat,
      "darkSquares",
      DEFAULT_BOARD_PALETTE.darkSquares,
      this.qualityProfile.boardDark,
      this.qualityProfile.textureAnisotropy,
    );

    lightMats.push(lightMat);
    darkMats.push(darkMat);
    this.lightSquareMats.push(lightMat);
    this.darkSquareMats.push(darkMat);
  }

  private populateBoardGeometry(lightMats: QualityMaterial[], darkMats: QualityMaterial[]): void {
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

    const baseMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0xffffff,
      this.qualityProfile.boardFrame,
    );
    applyWoodMaterialTheme(
      this.renderer,
      baseMat,
      "frame",
      DEFAULT_BOARD_PALETTE.frame,
      this.qualityProfile.boardFrame,
      this.qualityProfile.textureAnisotropy,
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

    this.accentMat = createTieredMaterial(
      this.qualityProfile.usePhysicalMaterials,
      0xd4af37,
      this.qualityProfile.boardAccent,
    );
    const accent = new Mesh(new RoundedBoxGeometry(9.35, 0.12, 9.35, 3, 0.05), this.accentMat);
    accent.position.set(0, -0.35, 0);
    accent.castShadow = true;
    accent.receiveShadow = true;
    this.boardGroup.add(accent);

    this.boardGroup.add(this.coordinateGroup);
    if (this.coordinatesVisible) {
      this.buildCoordinateLabels(this.currentOrientation);
    }
  }

  private spawnCaptureBurst(position: Vector3, accentHex: string): void {
    const PARTICLE_COUNT = 32;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities: Vector3[] = [];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y + 0.3;
      positions[i * 3 + 2] = position.z;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 0.8 + Math.random() * 1.8;
      velocities.push(new Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.abs(Math.cos(phi)) * speed * 1.4,
        Math.sin(phi) * Math.sin(theta) * speed,
      ));
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: new Color(accentHex),
      size: 0.18,
      transparent: true,
      opacity: 1.0,
      blending: AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new Points(geometry, material);
    this.root.add(points);

    this.activeCaptureParticles.push({
      points,
      material,
      velocities,
      startedAt: performance.now(),
      durationMs: 440,
    });
  }

  private updateCaptureParticles(now: number): void {
    const GRAVITY = -9.8;
    const toRemove: CaptureParticleBurst[] = [];

    for (const burst of this.activeCaptureParticles) {
      const elapsed = (now - burst.startedAt) / 1000;
      const progress = clampUnit((now - burst.startedAt) / burst.durationMs);

      const posAttr = burst.points.geometry.getAttribute("position") as Float32BufferAttribute;
      const PARTICLE_COUNT = posAttr.count;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const vel = burst.velocities[i];
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + vel.x * 0.016,
          posAttr.getY(i) + (vel.y + GRAVITY * elapsed) * 0.016,
          posAttr.getZ(i) + vel.z * 0.016,
        );
      }
      posAttr.needsUpdate = true;

      burst.material.opacity = 1 - progress * progress;

      if (progress >= 1) {
        toRemove.push(burst);
      }
    }

    for (const burst of toRemove) {
      this.root.remove(burst.points);
      burst.points.geometry.dispose();
      burst.material.dispose();
      this.activeCaptureParticles.splice(this.activeCaptureParticles.indexOf(burst), 1);
    }
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
      const now = performance.now();

      // Capture animation state BEFORE updates to detect final frame
      const hadCameraTransition = this.activeCameraTransition !== null;
      const hadReturnAnimation = this.returnAnimation !== null;
      const hadStageTransition = this.activeStageTransition !== null;
      const hadCaptureParticles = this.activeCaptureParticles.length > 0;

      this.updateCameraTransition(now);
      this.updateReturnAnimation(now);
      this.updateStageTransition(now);
      this.updateCaptureParticles(now);

      const animatedHighlights = this.updateAnimatedHighlights(now);

      const hasActiveAnimations =
        this.activeCameraTransition !== null ||
        this.returnAnimation !== null ||
        this.activeStageTransition !== null ||
        this.transitionQueue.length > 0 ||
        this.activeCaptureParticles.length > 0 ||
        animatedHighlights.hasActive;

      // If an animation just ended, force render for the final frame
      const animationJustEnded =
        (hadCameraTransition && !this.activeCameraTransition) ||
        (hadReturnAnimation && !this.returnAnimation) ||
        (hadStageTransition && !this.activeStageTransition) ||
        (hadCaptureParticles && this.activeCaptureParticles.length === 0);

      if (!this.activeCameraTransition) {
        this.controls.update();
      }

      if (this.needsRender || hasActiveAnimations || animationJustEnded || animatedHighlights.didChange) {
        this.onBeforeRender?.();
        this.syncSpriteVisuals();
        if (this.pipeline) {
          this.pipeline.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
        this.updatePerformanceMonitor(now);
        this.needsRender = false;
      }

      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  private syncPiecesToCurrentState(): void {
    if (!this.currentState) {
      return;
    }

    this.transitionQueue.length = 0;
    this.activeStageTransition = null;
    this.syncPieces(this.currentState.fen);
  }

  private syncPieces(fen: string): void {
    if (!this.currentState) {
      return;
    }

    this.clearDragState();
    this.returnAnimation = null;
    this.clearSelectedPieceHighlight();
    this.clearPieceEffectMaterials(this.pieceGroup);
    this.clearSprites();
    this.pieceBySquare.clear();
    this.pieceGroup.clear();

    for (const piece of fenToPieces(fen)) {
      const clone = this.createPieceInstance(piece);
      this.pieceBySquare.set(piece.square, clone);
      this.pieceGroup.add(clone);
    }

    if (this.currentState.selectedSquare) {
      this.applySelectedPieceHighlight(
        this.currentState.selectedSquare,
        this.currentState.theme.highlightPrimary,
      );
    }
  }

  private createPieceInstance(piece: BoardPiece): Group {
    const prototype = this.prototypes.get(piece.type);
    if (!prototype) {
      throw new Error(`Missing prototype for piece type "${piece.type}".`);
    }

    const clone = prototype.clone(true);
    const pieceMat = piece.color === "w" ? this.lightPieceMat : this.darkPieceMat;

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      if (child.name === "felt") {
        child.material = this.feltMat;
        child.userData.baseMaterial = this.feltMat;
      } else if (child.name === "eye") {
        child.material = this.eyeMat;
        child.userData.baseMaterial = this.eyeMat;
      } else {
        child.material = pieceMat;
        child.userData.baseMaterial = pieceMat;
      }
    });

    this.updatePieceIdentity(clone, piece.square, piece.type, piece.color);
    this.positionPieceAtSquare(clone, piece.square);
    clone.scale.setScalar(PIECE_SCALE);
    clone.userData.effectOpacity = 1;
    clone.userData.spriteBaseScale = SPRITE_SCALE_BY_TYPE[piece.type];

    const sprite = this.createPieceSprite(piece);
    clone.userData.sprite = sprite;
    this.spriteGroup.add(sprite);
    this.setPieceOpacity(clone, 1);

    return clone;
  }

  private updatePieceIdentity(
    piece: Group,
    square: Square,
    type: PieceSymbol,
    color: PieceColor,
  ): void {
    piece.name = `${color}-${type}-${square}`;
    piece.userData.square = square;
    piece.userData.color = color;
    piece.userData.type = type;
    piece.rotation.y = type === "n" ? (color === "b" ? 0 : Math.PI) : 0;
  }

  private positionPieceAtSquare(piece: Group, square: Square, y = 0): void {
    const { x, z } = squareToCoords(square);
    piece.position.set(x, y, z);
  }

  private createSquareVector(square: Square, y = 0): Vector3 {
    const { x, z } = squareToCoords(square);
    return new Vector3(x, y, z);
  }

  private enqueueTransitions(steps: StageTransitionStep[]): void {
    if (steps.length === 0) {
      this.syncPiecesToCurrentState();
      return;
    }

    this.transitionQueue.push(...steps);
    this.startNextQueuedTransition(performance.now());
  }

  private startNextQueuedTransition(now: number): void {
    if (this.activeStageTransition || this.transitionQueue.length === 0) {
      return;
    }

    const step = this.transitionQueue.shift();
    if (!step) {
      return;
    }

    const activeTransition = this.createActiveTransition(step, now);
    if (!activeTransition) {
      this.syncPiecesToCurrentState();
      return;
    }

    this.activeStageTransition = activeTransition;
  }

  private createActiveTransition(
    step: StageTransitionStep,
    startedAt: number,
  ): ActiveStageTransition | null {
    const descriptor = describeMoveTransition(step);
    const mover = this.pieceBySquare.get(descriptor.moverFrom);
    if (!mover) {
      return null;
    }

    const animationConfig = ANIMATION_MODE_CONFIG[this.animationMode as keyof typeof ANIMATION_MODE_CONFIG];
    if (!animationConfig) {
      return null;
    }

    this.clearSelectedPieceHighlight();

    const motions: PieceMotionAnimation[] = [
      {
        piece: mover,
        from: mover.position.clone(),
        to: this.createSquareVector(descriptor.moverTo),
        arcHeight: animationConfig.arcHeight,
      },
    ];
    const scales: PieceScaleAnimation[] = [];
    const opacities: PieceOpacityAnimation[] = [];

    let capturedPiece: Group | null = null;
    let restoredPiece: Group | null = null;
    let rookPiece: Group | null = null;

    if (descriptor.captureSquare && descriptor.direction === "forward") {
      capturedPiece = this.pieceBySquare.get(descriptor.captureSquare) ?? null;
      if (!capturedPiece) {
        return null;
      }

      this.pieceBySquare.delete(descriptor.captureSquare);

      if (animationConfig.captureFx) {
        scales.push({
          piece: capturedPiece,
          from: PIECE_SCALE,
          to: PIECE_SCALE * 0.2,
          startProgress: 0,
          endProgress: 1,
        });
        opacities.push({
          piece: capturedPiece,
          from: 1,
          to: 0,
          startProgress: 0,
          endProgress: 1,
        });
        // Spawn particle burst at capture position
        const capturePos = this.createSquareVector(descriptor.captureSquare!, 0.3);
        const accentHex = this.currentState?.theme.highlightPrimary ?? "#f6c344";
        this.spawnCaptureBurst(capturePos, accentHex);
      } else {
        capturedPiece.visible = false;
      }
    }

    if (descriptor.moverFrom !== descriptor.moverTo) {
      this.pieceBySquare.delete(descriptor.moverFrom);
    }

    if (
      descriptor.captureSquare &&
      descriptor.direction === "backward" &&
      descriptor.capturedPiece
    ) {
      // On undo, release the mover's current square before restoring the captured piece there.
      restoredPiece = this.createPieceInstance(descriptor.capturedPiece);
      this.positionPieceAtSquare(restoredPiece, descriptor.captureSquare);
      this.pieceBySquare.set(descriptor.captureSquare, restoredPiece);
      this.pieceGroup.add(restoredPiece);

      if (animationConfig.captureFx) {
        restoredPiece.scale.setScalar(PIECE_SCALE * 0.3);
        this.setPieceOpacity(restoredPiece, 0.15);
        scales.push({
          piece: restoredPiece,
          from: PIECE_SCALE * 0.3,
          to: PIECE_SCALE,
          startProgress: 0,
          endProgress: 1,
        });
        opacities.push({
          piece: restoredPiece,
          from: 0.15,
          to: 1,
          startProgress: 0,
          endProgress: 1,
        });
      }
    }
    this.pieceBySquare.set(descriptor.moverTo, mover);
    mover.userData.square = descriptor.moverTo;

    if (descriptor.rookMove) {
      rookPiece = this.pieceBySquare.get(descriptor.rookMove.from) ?? null;
      if (!rookPiece) {
        return null;
      }

      this.pieceBySquare.delete(descriptor.rookMove.from);
      this.pieceBySquare.set(descriptor.rookMove.to, rookPiece);
      rookPiece.userData.square = descriptor.rookMove.to;

      motions.push({
        piece: rookPiece,
        from: rookPiece.position.clone(),
        to: this.createSquareVector(descriptor.rookMove.to),
        arcHeight: animationConfig.arcHeight * 0.35,
      });
    }

    if (descriptor.isPromotion && animationConfig.promotionFx) {
      scales.push({
        piece: mover,
        from: PIECE_SCALE,
        to: PIECE_SCALE * 0.7,
        startProgress: 0.55,
        endProgress: 1,
      });
      opacities.push({
        piece: mover,
        from: 1,
        to: 0.3,
        startProgress: 0.55,
        endProgress: 1,
      });
    }

    return {
      descriptor,
      startedAt,
      durationMs: animationConfig.durationMs,
      motions,
      scales,
      opacities,
      finalize: () => {
        this.finalizeTransition(
          descriptor,
          mover,
          rookPiece,
          capturedPiece,
          restoredPiece,
        );
      },
    };
  }

  private updateStageTransition(now: number): void {
    if (!this.activeStageTransition) {
      this.startNextQueuedTransition(now);
      return;
    }

    const transition = this.activeStageTransition;
    const progress = clampUnit((now - transition.startedAt) / transition.durationMs);

    transition.motions.forEach((motion) => {
      motion.piece.position.copy(
        this.sampleMotionPoint(motion.from, motion.to, motion.arcHeight, progress),
      );
    });

    transition.scales.forEach((scaleAnimation) => {
      const localProgress = easeInOutCubic(
        normalizeWindowProgress(
          progress,
          scaleAnimation.startProgress,
          scaleAnimation.endProgress,
        ),
      );
      scaleAnimation.piece.scale.setScalar(
        lerp(scaleAnimation.from, scaleAnimation.to, localProgress),
      );
    });

    transition.opacities.forEach((opacityAnimation) => {
      const localProgress = easeInOutCubic(
        normalizeWindowProgress(
          progress,
          opacityAnimation.startProgress,
          opacityAnimation.endProgress,
        ),
      );
      this.setPieceOpacity(
        opacityAnimation.piece,
        lerp(opacityAnimation.from, opacityAnimation.to, localProgress),
      );
    });

    if (progress >= 1) {
      transition.finalize();
      this.activeStageTransition = null;
      this.startNextQueuedTransition(now);
    }
  }

  private sampleMotionPoint(
    from: Vector3,
    to: Vector3,
    arcHeight: number,
    progress: number,
  ): Vector3 {
    const eased = easeInOutCubic(progress);
    if (arcHeight <= 0) {
      return _motionResult.lerpVectors(from, to, eased);
    }

    _motionControl.addVectors(from, to).multiplyScalar(0.5);
    _motionControl.y = Math.max(from.y, to.y) + arcHeight;
    const oneMinusT = 1 - eased;

    return _motionResult
      .copy(from)
      .multiplyScalar(oneMinusT * oneMinusT)
      .add(_motionControl.multiplyScalar(2 * oneMinusT * eased))
      .add(_motionTail.copy(to).multiplyScalar(eased * eased));
  }

  private finalizeTransition(
    descriptor: MoveTransitionDescriptor,
    mover: Group,
    rookPiece: Group | null,
    capturedPiece: Group | null,
    restoredPiece: Group | null,
  ): void {
    this.positionPieceAtSquare(mover, descriptor.moverTo);
    mover.visible = true;
    mover.scale.setScalar(PIECE_SCALE);

    if (capturedPiece) {
      this.clearPieceEffectMaterials(capturedPiece);
      this.removePieceSprite(capturedPiece);
      this.pieceGroup.remove(capturedPiece);
      capturedPiece.visible = true;
    }

    if (restoredPiece) {
      this.positionPieceAtSquare(restoredPiece, descriptor.captureSquare!);
      restoredPiece.scale.setScalar(PIECE_SCALE);
      restoredPiece.visible = true;
      this.clearPieceEffectMaterials(restoredPiece);
      this.updatePieceIdentity(
        restoredPiece,
        descriptor.captureSquare!,
        restoredPiece.userData.type as PieceSymbol,
        restoredPiece.userData.color as PieceColor,
      );
      this.setPieceOpacity(restoredPiece, restoredPiece.userData.effectOpacity ?? 1);
    }

    if (descriptor.isPromotion) {
      this.clearPieceEffectMaterials(mover);
      this.removePieceSprite(mover);
      this.pieceGroup.remove(mover);
      const promotedPiece = this.createPieceInstance({
        square: descriptor.moverTo,
        color: descriptor.moverColor,
        type: descriptor.moverEndType,
      });
      this.pieceBySquare.set(descriptor.moverTo, promotedPiece);
      this.pieceGroup.add(promotedPiece);
    } else {
      this.clearPieceEffectMaterials(mover);
      this.updatePieceIdentity(
        mover,
        descriptor.moverTo,
        descriptor.moverEndType,
        descriptor.moverColor,
      );
      this.setPieceOpacity(mover, mover.userData.effectOpacity ?? 1);
    }

    if (rookPiece && descriptor.rookMove) {
      this.positionPieceAtSquare(rookPiece, descriptor.rookMove.to);
      rookPiece.scale.setScalar(PIECE_SCALE);
      this.clearPieceEffectMaterials(rookPiece);
      this.updatePieceIdentity(
        rookPiece,
        descriptor.rookMove.to,
        rookPiece.userData.type as PieceSymbol,
        rookPiece.userData.color as PieceColor,
      );
      this.setPieceOpacity(rookPiece, rookPiece.userData.effectOpacity ?? 1);
    }
  }

  private setPieceOpacity(piece: Group, opacity: number): void {
    piece.userData.effectOpacity = opacity;
    const resolvedOpacity =
      (piece.visible ? 1 : 0) * opacity * this.pieceRepresentationOpacity;

    piece.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) {
        return;
      }

      const baseMaterial = child.userData.baseMaterial;
      if (
        !(baseMaterial instanceof MeshPhysicalMaterial) &&
        !(baseMaterial instanceof MeshStandardMaterial)
      ) {
        return;
      }

      let fxMaterial = child.userData.fxMaterial;
      if (
        resolvedOpacity < 0.999 &&
        !(fxMaterial instanceof MeshPhysicalMaterial) &&
        !(fxMaterial instanceof MeshStandardMaterial)
      ) {
        fxMaterial = baseMaterial.clone();
        child.userData.fxMaterial = fxMaterial;
      }

      if (
        resolvedOpacity >= 0.999 &&
        fxMaterial instanceof Material &&
        child.material === fxMaterial
      ) {
        child.material = baseMaterial;
        fxMaterial.dispose();
        delete child.userData.fxMaterial;
        return;
      }

      const activeMaterial =
        child.material === baseMaterial && fxMaterial instanceof Material
          ? fxMaterial
          : child.material;

      if (
        activeMaterial instanceof MeshPhysicalMaterial ||
        activeMaterial instanceof MeshStandardMaterial
      ) {
        activeMaterial.transparent = resolvedOpacity < 0.999;
        activeMaterial.opacity = resolvedOpacity;
        activeMaterial.depthWrite = resolvedOpacity >= 0.999;
        child.visible = resolvedOpacity > 0.01;
        if (child.material !== activeMaterial) {
          child.material = activeMaterial;
        }
      }
    });
  }

  private clearPieceEffectMaterials(root: Group | Mesh): void {
    root.traverse((child) => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) {
        return;
      }

      const fxMaterial = child.userData.fxMaterial;
      if (!(fxMaterial instanceof Material)) {
        return;
      }

      if (child.material === fxMaterial && child.userData.baseMaterial instanceof Material) {
        child.material = child.userData.baseMaterial;
      }

      fxMaterial.dispose();
      delete child.userData.fxMaterial;
    });
  }

  private updateHighlights(state: RenderState): void {
    this.disposeHighlights();
    this.clearSelectedPieceHighlight();

    if (state.selectedSquare) {
      this.addAnimatedHighlight(
        createHighlight(state.selectedSquare, state.theme.highlightPrimary, 0.46),
        "static",
        0.46,
      );
      this.applySelectedPieceHighlight(state.selectedSquare, state.theme.highlightPrimary);
    }

    state.legalTargets.forEach((target) => {
      const isCastling = (state.castlingTargets ?? []).includes(target);
      const color = isCastling
        ? shiftHex(state.theme.highlightSecondary, 0.08, 0.06)
        : state.theme.highlightSecondary;
      const opacity = isCastling ? 0.44 : 0.34;

      this.addAnimatedHighlight(
        createTargetIndicator(
          target,
          color,
          opacity,
          this.pieceBySquare.has(target),
        ),
        isCastling ? "pulse" : "static",
        opacity,
        isCastling
          ? { durationMs: HINT_HIGHLIGHT_MS, startedAt: performance.now() }
          : undefined,
      );
    });

    if (state.hintMove && this.activeHintKey !== this.suppressedHintKey) {
      const hintColor = shiftHex(
        mixHex(state.theme.highlightPrimary, state.theme.highlightSecondary, 0.4),
        0.08,
        0.06,
      );
      this.addAnimatedHighlight(
        createHighlight(state.hintMove.from, hintColor, 0.42, 0.1, 0.92),
        "pulse",
        0.42,
        {
          durationMs: HINT_HIGHLIGHT_MS,
          startedAt: this.hintAnimationStartedAt,
        },
      );
      this.addAnimatedHighlight(
        createHighlight(state.hintMove.to, hintColor, 0.56, 0.11, 0.92),
        "pulse",
        0.56,
        {
          durationMs: HINT_HIGHLIGHT_MS,
          phaseOffset: Math.PI / 4,
          startedAt: this.hintAnimationStartedAt,
        },
      );
    }

    if (state.lastMove) {
      const lastMoveColor = mixHex(state.theme.highlightSecondary, "#ffffff", 0.12);
      this.addAnimatedHighlight(
        createHighlight(state.lastMove.from, lastMoveColor, 0.28, 0.08, 0.88),
        "timed",
        0.28,
        {
          durationMs: LAST_MOVE_HIGHLIGHT_MS,
          startedAt: this.lastMoveAnimationStartedAt,
        },
      );
      this.addAnimatedHighlight(
        createHighlight(state.lastMove.to, lastMoveColor, 0.4, 0.09, 0.88),
        "timed",
        0.4,
        {
          durationMs: LAST_MOVE_HIGHLIGHT_MS,
          startedAt: this.lastMoveAnimationStartedAt,
        },
      );
    }

    this.updateAnimatedHighlights(performance.now());
  }

  private applyTheme(theme: ThemeDefinition): void {
    const boardPalette = deriveBoardPalette(theme);

    if (this.scene.fog instanceof FogExp2) {
      this.scene.fog.color.set(theme.canvasFog);
      this.scene.fog.density = 0.0095;
    }
    this.applyLightingTheme(theme);
    this.lightSquareMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "lightSquares",
        boardPalette.lightSquares,
        this.qualityProfile.boardLight,
        this.qualityProfile.textureAnisotropy,
      ),
    );
    this.darkSquareMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "darkSquares",
        boardPalette.darkSquares,
        this.qualityProfile.boardDark,
        this.qualityProfile.textureAnisotropy,
      ),
    );
    this.frameMats.forEach((material) =>
      applyWoodMaterialTheme(
        this.renderer,
        material,
        "frame",
        boardPalette.frame,
        this.qualityProfile.boardFrame,
        this.qualityProfile.textureAnisotropy,
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
      this.syncPiecesToCurrentState();
    }
  }

  private applyLightingTheme(theme: ThemeDefinition): void {
    const keyHex = mixHex(theme.whitePiece, "#fff4e1", 0.38);
    const rimHex = shiftHex(mixHex(theme.highlightSecondary, "#9ef2ff", 0.56), 0.06, 0.08);
    const accentHex = shiftHex(mixHex(theme.highlightPrimary, theme.canvasAccent, 0.5), 0.08, 0.04);
    const skyHex = mixHex(theme.canvasFog, theme.whitePiece, 0.14);
    const groundHex = mixHex(theme.boardFrame, "#010204", 0.74);

    if (this.keyLight) {
      this.keyLight.color.set(keyHex);
    }
    if (this.leftRimLight) {
      this.leftRimLight.color.set(rimHex);
    }
    if (this.rightRimLight) {
      this.rightRimLight.color.set(accentHex);
    }
    if (this.hemisphereLight) {
      this.hemisphereLight.color.set(skyHex);
      this.hemisphereLight.groundColor.set(groundHex);
    }
  }

  private disposeHighlights(): void {
    disposeObjectResources(this.highlightGroup);
    this.highlightGroup.clear();
    this.animatedHighlights = [];
  }

  private addAnimatedHighlight(
    highlight: { mesh: Mesh; material: MeshStandardMaterial },
    mode: AnimatedHighlight["mode"],
    baseOpacity: number,
    options: Partial<Pick<AnimatedHighlight, "durationMs" | "phaseOffset" | "startedAt">> = {},
  ): void {
    this.highlightGroup.add(highlight.mesh);
    this.animatedHighlights.push({
      mesh: highlight.mesh,
      material: highlight.material,
      mode,
      baseOpacity,
      startedAt: options.startedAt ?? performance.now(),
      durationMs: options.durationMs,
      phaseOffset: options.phaseOffset,
    });
  }

  private updateAnimatedHighlights(now: number): { hasActive: boolean; didChange: boolean } {
    let hasActive = false;
    let didChange = false;

    for (const highlight of this.animatedHighlights) {
      let opacity = highlight.baseOpacity;
      let isActive = false;

      if (highlight.mode === "pulse") {
        const elapsed = now - highlight.startedAt;
        const duration = highlight.durationMs ?? HINT_HIGHLIGHT_MS;
        const fade = clampUnit(1 - elapsed / duration);
        const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 0.012 + (highlight.phaseOffset ?? 0)));
        opacity = highlight.baseOpacity * pulse * fade;
        isActive = elapsed < duration;
      }

      if (highlight.mode === "timed") {
        const elapsed = now - highlight.startedAt;
        const duration = highlight.durationMs ?? LAST_MOVE_HIGHLIGHT_MS;
        opacity = highlight.baseOpacity * clampUnit(1 - elapsed / duration);
        isActive = elapsed < duration;
      }

      const visible = opacity > 0.01;
      if (highlight.material.opacity !== opacity || highlight.mesh.visible !== visible) {
        didChange = true;
      }
      highlight.material.opacity = opacity;
      highlight.mesh.visible = visible;
      hasActive ||= isActive;
    }

    return { hasActive, didChange };
  }

  private applySelectedPieceHighlight(square: Square, color: string): void {
    const piece = this.pieceBySquare.get(square);
    if (!piece) {
      return;
    }

    this.clearSelectedPieceHighlight();
    this.selectedPiece = piece;

    piece.traverse((child) => {
      if (!(child instanceof Mesh) || child.name === "felt" || child.name === "eye") {
        return;
      }

      const baseMaterial = child.userData.baseMaterial;
      if (
        !(baseMaterial instanceof MeshPhysicalMaterial) &&
        !(baseMaterial instanceof MeshStandardMaterial)
      ) {
        return;
      }

      const highlightMaterial = baseMaterial.clone() as MeshStandardMaterial | MeshPhysicalMaterial;
      highlightMaterial.emissive = new Color(color);
      highlightMaterial.emissiveIntensity = 0.35;
      highlightMaterial.transparent = this.pieceRepresentationOpacity < 0.999;
      highlightMaterial.opacity =
        this.pieceRepresentationOpacity * (piece.userData.effectOpacity ?? 1);
      child.material = highlightMaterial;
      this.selectedPieceHighlightMaterials.push(highlightMaterial);
    });
  }

  private clearSelectedPieceHighlight(): void {
    if (this.selectedPiece) {
      this.selectedPiece.traverse((child) => {
        if (!(child instanceof Mesh)) {
          return;
        }

        const baseMaterial = child.userData.baseMaterial;
        if (baseMaterial instanceof Material) {
          child.material = baseMaterial;
        }
      });
      this.setPieceOpacity(this.selectedPiece, this.selectedPiece.userData.effectOpacity ?? 1);
    }

    this.selectedPiece = null;
    while (this.selectedPieceHighlightMaterials.length > 0) {
      this.selectedPieceHighlightMaterials.pop()?.dispose();
    }
  }

  private updateReturnAnimation(now: number): void {
    if (!this.returnAnimation) {
      return;
    }

    const progress = clampUnit((now - this.returnAnimation.startedAt) / this.returnAnimation.durationMs);
    this.returnAnimation.piece.position.lerpVectors(
      this.returnAnimation.from,
      this.returnAnimation.to,
      easeOutCubic(progress),
    );

    if (progress >= 1) {
      this.returnAnimation = null;
    }
  }

  private startReturnAnimation(piece: Group, sourceSquare: Square): void {
    const { x, z } = squareToCoords(sourceSquare);
    this.returnAnimation = {
      piece,
      from: piece.position.clone(),
      to: new Vector3(x, 0, z),
      startedAt: performance.now(),
      durationMs: RETURN_DURATION_MS,
    };
  }

  private clearDragState(): void {
    this.dragState = null;
  }

  private isInteractionLocked(): boolean {
    return this.activeStageTransition !== null || this.transitionQueue.length > 0;
  }

  private isTouchPointer(event: PointerEvent): boolean {
    return event.pointerType === "touch";
  }

  private isDraggablePieceSquare(square: Square | null): square is Square {
    if (!square || !this.currentState?.canInteract || this.isInteractionLocked()) {
      return false;
    }

    return this.pieceBySquare.get(square)?.userData.color === this.currentState.playerColor;
  }

  private resolveBoardIntersection(event: PointerEvent): BoardIntersection | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObject(this.hitPlane, false);
    if (intersections.length === 0) {
      return null;
    }

    const localPoint = this.root.worldToLocal(intersections[0].point.clone());
    return {
      square: resolveSquareFromBoardPoint(localPoint.x, localPoint.z),
      localPoint,
    };
  }

  private updateDragPosition(event: PointerEvent): void {
    if (!this.dragState) {
      return;
    }

    const intersection = this.resolveBoardIntersection(event);
    if (!intersection) {
      return;
    }

    this.dragState.piece.position.set(intersection.localPoint.x, DRAG_LIFT_Y, intersection.localPoint.z);
    this.markDirty();
  }

  private beginPieceDrag(event: PointerEvent, sourceSquare: Square): void {
    const piece = this.pieceBySquare.get(sourceSquare);
    if (!piece) {
      return;
    }

    if (this.returnAnimation?.piece === piece) {
      this.returnAnimation = null;
    }

    this.dragState = {
      pointerId: event.pointerId,
      sourceSquare,
      piece,
    };
    piece.position.y = DRAG_LIFT_Y;

    if (this.currentState?.selectedSquare !== sourceSquare) {
      this.onSquareSelect(sourceSquare);
    }

    this.updateDragPosition(event);
  }

  private finishPieceDrag(event: PointerEvent): boolean {
    if (!this.dragState) {
      return false;
    }

    const { piece, sourceSquare } = this.dragState;
    const targetSquare = this.resolveBoardIntersection(event)?.square ?? null;
    const canDrop =
      !!targetSquare &&
      this.currentState?.selectedSquare === sourceSquare &&
      this.currentState.legalTargets.includes(targetSquare);

    this.clearDragState();

    if (canDrop && targetSquare) {
      const { x, z } = squareToCoords(targetSquare);
      piece.position.set(x, 0, z);
      this.onSquareSelect(targetSquare);
      return true;
    }

    this.startReturnAnimation(piece, sourceSquare);
    return true;
  }

  private dismissHintHighlights(): void {
    if (!this.currentState?.hintMove || !this.activeHintKey) {
      return;
    }

    this.suppressedHintKey = this.activeHintKey;
    this.currentHighlightKey = [
      this.currentState.selectedSquare ?? "",
      this.currentState.legalTargets.join(","),
      this.currentState.hintMove?.from ?? "",
      this.currentState.hintMove?.to ?? "",
      this.currentState.lastMove?.from ?? "",
      this.currentState.lastMove?.to ?? "",
      this.currentState.theme.id,
      this.suppressedHintKey,
    ].join("|");
    this.updateHighlights(this.currentState);
  }

  private cancelGamePointerGesture(): void {
    if (this.dragState) {
      this.startReturnAnimation(this.dragState.piece, this.dragState.sourceSquare);
      this.clearDragState();
    }

    this.resetPointerTracking();
  }

  private resolveSquareFromPointerEvent(event: PointerEvent): Square | null {
    return this.resolveBoardIntersection(event)?.square ?? null;
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
    this.pointerDownOwnPieceSquare = null;
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.markDirty();
    this.dismissHintHighlights();

    if (this.isTouchPointer(event)) {
      this.touchPointerIds.add(event.pointerId);
      if (this.touchPointerIds.size > 1) {
        this.multiTouchGesture = true;
        this.cancelGamePointerGesture();
        return;
      }
    }

    if (this.multiTouchGesture) {
      return;
    }

    // Only allow left-click for piece interaction to avoid camera rotation conflicts
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.pointerDownPosition.set(event.clientX, event.clientY);
    this.pointerMaxTravel = 0;
    this.pointerDownOwnPieceSquare = null;

    if (this.currentState?.canInteract && !this.isInteractionLocked()) {
      const pointerDownSquare = this.resolveSquareFromPointerEvent(event);
      this.pointerDownOwnPieceSquare = this.isDraggablePieceSquare(pointerDownSquare)
        ? pointerDownSquare
        : null;
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const maxTravel = this.updatePointerTravel(event);

    if (this.dragState) {
      this.updateDragPosition(event);
      return;
    }

    if (
      !this.multiTouchGesture &&
      maxTravel > CLICK_THRESHOLD_PX &&
      this.pointerDownOwnPieceSquare
    ) {
      this.beginPieceDrag(event, this.pointerDownOwnPieceSquare);
    }
  };

  private handlePointerUp = (event: PointerEvent) => {
    const isTouch = this.isTouchPointer(event);
    if (isTouch) {
      this.touchPointerIds.delete(event.pointerId);
    }

    if (event.pointerId !== this.activePointerId) {
      if (isTouch && this.touchPointerIds.size === 0) {
        this.multiTouchGesture = false;
      }
      return;
    }

    if (this.dragState) {
      this.finishPieceDrag(event);
      this.resetPointerTracking();
      if (isTouch && this.touchPointerIds.size === 0) {
        this.multiTouchGesture = false;
      }
      return;
    }

    const maxTravel = this.updatePointerTravel(event);
    const shouldSelect =
      this.currentState?.canInteract &&
      !this.isInteractionLocked() &&
      !this.multiTouchGesture &&
      maxTravel <= CLICK_THRESHOLD_PX;
    const square = shouldSelect ? this.resolveSquareFromPointerEvent(event) : null;
    this.resetPointerTracking();

    if (isTouch && this.touchPointerIds.size === 0) {
      this.multiTouchGesture = false;
    }

    if (square) {
      this.onSquareSelect(square);
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
    const isTouch = this.isTouchPointer(event);
    if (isTouch) {
      this.touchPointerIds.delete(event.pointerId);
    }

    if (event.pointerId !== this.activePointerId) {
      if (isTouch && this.touchPointerIds.size === 0) {
        this.multiTouchGesture = false;
      }
      return;
    }

    if (this.dragState) {
      this.startReturnAnimation(this.dragState.piece, this.dragState.sourceSquare);
      this.clearDragState();
    }
    this.resetPointerTracking();

    if (isTouch && this.touchPointerIds.size === 0) {
      this.multiTouchGesture = false;
    }
  };
}
