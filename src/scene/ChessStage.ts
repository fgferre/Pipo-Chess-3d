import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Square } from "chess.js";
import type { Orientation, ThemeDefinition } from "../types/game";
import { fenToPieces, squareToCoords } from "../utils/board";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

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

export class ChessStage {
  private readonly container: HTMLDivElement;
  private readonly onSquareSelect: (square: Square) => void;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(32, 1, 0.1, 60);
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly root = new Group();
  private readonly boardGroup = new Group();
  private readonly pieceGroup = new Group();
  private readonly highlightGroup = new Group();
  private readonly hitPlane = new Mesh(
    new PlaneGeometry(8, 8),
    new MeshStandardMaterial({ transparent: true, opacity: 0 }),
  );
  private readonly loader = new GLTFLoader();
  private readonly prototypes = new Map<string, Object3D>();
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private disposed = false;
  private paused = false;
  private introProgress = 0;
  private currentFen = "";
  private currentThemeId = "";
  private currentOrientation: Orientation = "white";
  private currentHighlightKey = "";

  constructor(container: HTMLDivElement, onSquareSelect: (square: Square) => void) {
    this.container = container;
    this.onSquareSelect = onSquareSelect;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.className = "board-canvas";
    this.container.appendChild(this.renderer.domElement);

    this.camera.position.set(6.6, 8.8, 8.4);
    this.camera.lookAt(0, 0.7, 0);

    this.scene.add(this.root);
    this.root.add(this.boardGroup, this.pieceGroup, this.highlightGroup);

    this.hitPlane.rotation.x = -Math.PI / 2;
    this.hitPlane.position.y = 0.03;
    this.root.add(this.hitPlane);

    const ambient = new AmbientLight("#d9efff", 1.8);
    const keyLight = new DirectionalLight("#fff2c8", 1.6);
    keyLight.position.set(4, 9, 5);
    const rimLight = new DirectionalLight("#7cc3ff", 0.8);
    rimLight.position.set(-5, 6, -4);
    this.scene.add(ambient, keyLight, rimLight);

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
  }

  async init(): Promise<void> {
    this.root.position.y = 0.35;

    try {
      const gltf = await this.loader.loadAsync("/assets/models/pipo-chess-set.gltf");
      const scene = gltf.scene;
      const board = scene.getObjectByName("Board");
      const library = scene.getObjectByName("PieceLibrary");

      if (board) {
        this.boardGroup.add(board.clone(true));
      } else {
        this.boardGroup.add(createFallbackBoard());
      }

      if (library) {
        library.children.forEach((child) => {
          this.prototypes.set(child.name, child.clone(true));
        });
      } else {
        buildFallbackPrototypes(this.prototypes);
      }
    } catch {
      this.boardGroup.add(createFallbackBoard());
      buildFallbackPrototypes(this.prototypes);
    }

    this.startLoop();
  }

  update(state: RenderState): void {
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
      this.rebuildPieces(state);
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

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
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

  private startLoop(): void {
    cancelAnimationFrame(this.animationFrame);
    if (this.disposed || this.paused) {
      return;
    }

    const tick = () => {
      if (this.disposed || this.paused) {
        return;
      }

      this.introProgress = Math.min(1, this.introProgress + 0.02);
      this.root.position.y = 0.35 * (1 - this.introProgress);
      this.renderer.render(this.scene, this.camera);
      this.animationFrame = requestAnimationFrame(tick);
    };

    this.animationFrame = requestAnimationFrame(tick);
  }

  private rebuildPieces(state: RenderState): void {
    this.pieceGroup.clear();
    const pieces = fenToPieces(state.fen);

    for (const piece of pieces) {
      const prototype = this.prototypes.get(prototypeName(piece.type));
      if (!prototype) {
        continue;
      }

      const clone = prototype.clone(true);
      clone.name = `${piece.color}-${piece.type}-${piece.square}`;
      const { x, z } = squareToCoords(piece.square);
      clone.position.set(x, 0.24, z);
      clone.scale.setScalar(0.92);

      clone.traverse((child) => {
        if (!(child instanceof Mesh)) {
          return;
        }

        child.material = new MeshStandardMaterial({
          color: piece.color === "w" ? state.theme.whitePiece : state.theme.blackPiece,
          roughness: 0.62,
          metalness: 0.08,
        });
      });

      this.pieceGroup.add(clone);
    }
  }

  private updateHighlights(state: RenderState): void {
    this.highlightGroup.clear();

    if (state.selectedSquare) {
      this.highlightGroup.add(createHighlight(state.selectedSquare, state.theme.highlightPrimary, 0.46));
    }

    state.legalTargets.forEach((target) => {
      this.highlightGroup.add(createHighlight(target, state.theme.highlightSecondary, 0.28));
    });

    if (state.hintMove) {
      this.highlightGroup.add(createHighlight(state.hintMove.to, state.theme.highlightPrimary, 0.55, 0.1));
    }
  }

  private applyTheme(theme: ThemeDefinition): void {
    this.boardGroup.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return;
      }

      child.material = new MeshStandardMaterial({
        color: child.name.includes("LightSquare")
          ? theme.boardLight
          : child.name.includes("DarkSquare")
            ? theme.boardDark
            : theme.boardFrame,
        roughness: child.name.includes("Frame") ? 0.7 : 0.95,
        metalness: child.name.includes("Frame") ? 0.14 : 0.03,
      });
    });
  }

  private handlePointerDown = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObject(this.hitPlane, false);
    if (intersections.length === 0) {
      return;
    }

    const localPoint = this.root.worldToLocal(intersections[0].point.clone());
    const fileIndex = Math.floor(localPoint.x + 4);
    const rank = 8 - Math.floor(localPoint.z + 4);

    if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) {
      return;
    }

    const square = `${files[fileIndex]}${rank}` as Square;
    this.onSquareSelect(square);
  };
}

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

function prototypeName(type: string): string {
  switch (type) {
    case "p":
      return "PawnPrototype";
    case "r":
      return "RookPrototype";
    case "n":
      return "KnightPrototype";
    case "b":
      return "BishopPrototype";
    case "q":
      return "QueenPrototype";
    case "k":
      return "KingPrototype";
    default:
      return "PawnPrototype";
  }
}

function createFallbackBoard(): Group {
  const board = new Group();
  const squareGeometry = new BoxGeometry(1, 0.12, 1);

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const light = (rank + file) % 2 === 0;
      const square = new Mesh(squareGeometry);
      square.name = light ? "LightSquare" : "DarkSquare";
      square.position.set(file - 3.5, 0, 3.5 - rank);
      board.add(square);
    }
  }

  const frame = new Mesh(new BoxGeometry(9.2, 0.32, 9.2));
  frame.name = "BoardFrame";
  frame.position.y = -0.18;
  board.add(frame);
  return board;
}

function buildFallbackPrototypes(map: Map<string, Object3D>): void {
  map.set("PawnPrototype", buildPiece("pawn"));
  map.set("RookPrototype", buildPiece("rook"));
  map.set("KnightPrototype", buildPiece("knight"));
  map.set("BishopPrototype", buildPiece("bishop"));
  map.set("QueenPrototype", buildPiece("queen"));
  map.set("KingPrototype", buildPiece("king"));
}

function buildPiece(type: "pawn" | "rook" | "knight" | "bishop" | "queen" | "king"): Group {
  const group = new Group();
  const body = new Mesh(new BoxGeometry(0.42, 0.5, 0.42));
  body.position.y = 0.32;
  const crown = new Mesh(
    new BoxGeometry(
      type === "pawn" ? 0.18 : type === "rook" ? 0.5 : type === "knight" ? 0.32 : 0.28,
      type === "pawn" ? 0.18 : type === "queen" || type === "king" ? 0.32 : 0.24,
      type === "pawn" ? 0.18 : type === "rook" ? 0.5 : 0.28,
    ),
  );
  crown.position.y = type === "pawn" ? 0.66 : 0.72;
  const base = new Mesh(new BoxGeometry(0.56, 0.14, 0.56));
  base.position.y = 0.08;
  group.add(body, crown, base);
  group.name = `${type[0].toUpperCase()}${type.slice(1)}Prototype`;
  return group;
}
