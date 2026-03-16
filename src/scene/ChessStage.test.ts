import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Raycaster,
  SpotLight,
  Texture,
  TOUCH,
  Vector3,
} from "three";
import { applyEngineMove, applyPlayerMove, createNewSession, redoTurn, undoTurn } from "../game/gameService";
import { themes } from "../data/themes";

let latestEnvironmentTarget: { texture: Texture; dispose: ReturnType<typeof vi.fn> } | null = null;
let latestRendererOptions: Record<string, unknown> | null = null;

vi.mock("three", async () => {
  const actual = await vi.importActual<typeof import("three")>("three");

  class MockWebGLRenderer {
    readonly domElement = document.createElement("canvas");
    readonly capabilities = { getMaxAnisotropy: () => 1 };
    readonly shadowMap = { enabled: false, type: actual.PCFSoftShadowMap };
    outputColorSpace = actual.SRGBColorSpace;
    toneMapping = actual.ACESFilmicToneMapping;
    toneMappingExposure = 1;

    constructor(options: Record<string, unknown> = {}) {
      latestRendererOptions = options;
    }

    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  class MockPMREMGenerator {
    constructor(renderer: unknown) {
      void renderer;
    }

    fromScene = vi.fn(() => {
      latestEnvironmentTarget = {
        texture: new actual.Texture(),
        dispose: vi.fn(),
      };
      return latestEnvironmentTarget;
    });

    dispose = vi.fn();
  }

  return {
    ...actual,
    PMREMGenerator: MockPMREMGenerator,
    WebGLRenderer: MockWebGLRenderer,
  };
});

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    enabled = true;
    enableRotate = true;
    enableDamping = false;
    dampingFactor = 0;
    minPolarAngle = 0;
    maxPolarAngle = 0;
    minDistance = 0;
    maxDistance = 0;
    touches = { ONE: 0, TWO: 2 };
    target = new Vector3();

    update = vi.fn();
    dispose = vi.fn();

    constructor(camera: unknown, domElement: HTMLElement) {
      void camera;
      void domElement;
    }
  },
}));

import {
  ChessStage,
  deriveBoardPalette,
  deriveTransitionBatch,
  describeMoveTransition,
  resolveSquareFromBoardPoint,
} from "./ChessStage";

const stages: ChessStage[] = [];

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
}

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    strokeText: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    font: "",
    globalAlpha: 1,
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "center",
    textBaseline: "middle",
  } as unknown as CanvasRenderingContext2D;
}

function createStage(onSquareSelect = vi.fn()) {
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { configurable: true, value: 600 });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 600 });
  document.body.appendChild(container);

  const stage = new ChessStage(container, onSquareSelect);
  const canvas = container.querySelector("canvas") as HTMLCanvasElement;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 600,
    bottom: 600,
    left: 0,
    width: 600,
    height: 600,
    toJSON: () => ({}),
  } as DOMRect);

  stages.push(stage);

  return {
    onSquareSelect,
    stage,
  };
}

function pointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
  pointerType = "mouse",
): PointerEvent {
  return { pointerId, clientX, clientY, pointerType } as PointerEvent;
}

function buildRenderState(
  overrides: Partial<Parameters<ChessStage["update"]>[0]> = {},
): Parameters<ChessStage["update"]>[0] {
  return {
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    orientation: "white",
    theme: themes[0],
    playerColor: "w",
    canInteract: true,
    lastMove: null,
    moveEntries: [],
    redoStack: [],
    selectedSquare: null,
    legalTargets: [],
    hintMove: null,
    ...overrides,
  };
}

function findFirstMesh(root: { traverse: (callback: (child: unknown) => void) => void }): Mesh {
  let mesh: Mesh | null = null;

  root.traverse((child) => {
    if (!mesh && child instanceof Mesh) {
      mesh = child;
    }
  });

  if (!mesh) {
    throw new Error("Expected a mesh in the object hierarchy.");
  }

  return mesh;
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

beforeEach(() => {
  const getContextMock = ((contextId: string) => {
    if (contextId === "2d") {
      return createCanvasContextMock();
    }

    return null;
  }) as HTMLCanvasElement["getContext"];

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(getContextMock);
});

afterEach(() => {
  stages.splice(0).forEach((stage) => stage.dispose());
  document.body.innerHTML = "";
  latestEnvironmentTarget = null;
  latestRendererOptions = null;
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("ChessStage", () => {
  it("derives forward, undo, and redo batches from move history deltas", () => {
    let session = createNewSession();
    const initialComparable = {
      fen: session.snapshot.fen,
      moveEntries: session.moveEntries,
      redoStack: session.redoStack,
    };

    session = applyPlayerMove(session, "e2", "e4")!;
    const afterPlayerMove = {
      fen: session.snapshot.fen,
      moveEntries: session.moveEntries,
      redoStack: session.redoStack,
    };

    session = applyEngineMove(session, "e7e5");
    const afterEngineMove = {
      fen: session.snapshot.fen,
      moveEntries: session.moveEntries,
      redoStack: session.redoStack,
    };

    const undone = undoTurn(session);
    const undoneComparable = {
      fen: undone.snapshot.fen,
      moveEntries: undone.moveEntries,
      redoStack: undone.redoStack,
    };

    const redone = redoTurn(undone);
    const redoneComparable = {
      fen: redone.snapshot.fen,
      moveEntries: redone.moveEntries,
      redoStack: redone.redoStack,
    };

    expect(deriveTransitionBatch(initialComparable, afterPlayerMove)).toMatchObject({
      kind: "animate",
      steps: [{ direction: "forward", reason: "move", move: { uci: "e2e4" } }],
    });
    expect(deriveTransitionBatch(afterEngineMove, undoneComparable)).toMatchObject({
      kind: "animate",
      steps: [
        { direction: "backward", reason: "undo", move: { uci: "e7e5" } },
        { direction: "backward", reason: "undo", move: { uci: "e2e4" } },
      ],
    });
    expect(deriveTransitionBatch(undoneComparable, redoneComparable)).toMatchObject({
      kind: "animate",
      steps: [
        { direction: "forward", reason: "redo", move: { uci: "e2e4" } },
        { direction: "forward", reason: "redo", move: { uci: "e7e5" } },
      ],
    });
  });

  it("describes castling, en passant, and promotion transitions from move metadata", () => {
    let castleSession = createNewSession();
    castleSession = applyPlayerMove(castleSession, "e2", "e4")!;
    castleSession = applyEngineMove(castleSession, "e7e5");
    castleSession = applyPlayerMove(castleSession, "g1", "f3")!;
    castleSession = applyEngineMove(castleSession, "b8c6");
    castleSession = applyPlayerMove(castleSession, "f1", "b5")!;
    castleSession = applyEngineMove(castleSession, "a7a6");
    castleSession = applyPlayerMove(castleSession, "b5", "a4")!;
    castleSession = applyEngineMove(castleSession, "g8f6");
    castleSession = applyPlayerMove(castleSession, "e1", "g1")!;

    const castleMove = castleSession.moveEntries.at(-1)!;
    const castleDescriptor = describeMoveTransition({
      move: castleMove,
      direction: "forward",
      reason: "move",
      sourceFen: castleMove.beforeFen,
      targetFen: castleMove.afterFen,
    });

    let enPassantSession = createNewSession();
    enPassantSession = applyPlayerMove(enPassantSession, "e2", "e4")!;
    enPassantSession = applyEngineMove(enPassantSession, "g8f6");
    enPassantSession = applyPlayerMove(enPassantSession, "e4", "e5")!;
    enPassantSession = applyEngineMove(enPassantSession, "d7d5");
    enPassantSession = applyPlayerMove(enPassantSession, "e5", "d6")!;

    const enPassantMove = enPassantSession.moveEntries.at(-1)!;
    const enPassantDescriptor = describeMoveTransition({
      move: enPassantMove,
      direction: "forward",
      reason: "move",
      sourceFen: enPassantMove.beforeFen,
      targetFen: enPassantMove.afterFen,
    });

    const promotionMove = {
      ply: 1,
      color: "w" as const,
      piece: "p" as const,
      san: "a8=Q",
      uci: "a7a8q",
      from: "a7" as const,
      to: "a8" as const,
      beforeFen: "8/P7/8/8/8/8/8/k6K w - - 0 1",
      afterFen: "Q7/8/8/8/8/8/8/k6K b - - 0 1",
      promotion: "q" as const,
    };
    const promotionDescriptor = describeMoveTransition({
      move: promotionMove,
      direction: "forward",
      reason: "move",
      sourceFen: promotionMove.beforeFen,
      targetFen: promotionMove.afterFen,
    });
    const undoPromotionDescriptor = describeMoveTransition({
      move: promotionMove,
      direction: "backward",
      reason: "undo",
      sourceFen: promotionMove.afterFen,
      targetFen: promotionMove.beforeFen,
    });

    expect(castleDescriptor.rookMove).toEqual({ from: "h1", to: "f1" });
    expect(castleDescriptor.captureSquare).toBeNull();
    expect(enPassantDescriptor.isEnPassant).toBe(true);
    expect(enPassantDescriptor.captureSquare).toBe("d5");
    expect(enPassantDescriptor.capturedPiece).toMatchObject({ square: "d5", type: "p" });
    expect(promotionDescriptor.isPromotion).toBe(true);
    expect(promotionDescriptor.moverStartType).toBe("p");
    expect(promotionDescriptor.moverEndType).toBe("q");
    expect(undoPromotionDescriptor.moverStartType).toBe("q");
    expect(undoPromotionDescriptor.moverEndType).toBe("p");
  });

  it("animates piece deltas in normal mode and syncs instantly when animations are off", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      activeStageTransition: unknown;
      pieceBySquare: Map<string, { position: Vector3 }>;
    };

    await stage.init();

    let session = createNewSession();
    stage.setAnimationMode("normal");
    stage.update(
      buildRenderState({
        fen: session.snapshot.fen,
        moveEntries: session.moveEntries,
        redoStack: session.redoStack,
      }),
    );

    session = applyPlayerMove(session, "e2", "e4")!;
    stage.update(
      buildRenderState({
        fen: session.snapshot.fen,
        moveEntries: session.moveEntries,
        redoStack: session.redoStack,
      }),
    );

    expect(stageInternals.activeStageTransition).not.toBeNull();
    expect(stageInternals.pieceBySquare.has("e4")).toBe(true);
    expect(stageInternals.pieceBySquare.get("e4")?.position.toArray()).toEqual([0.5, 0, 2.5]);

    const { stage: offStage } = createStage();
    const offStageInternals = offStage as unknown as {
      activeStageTransition: unknown;
      pieceBySquare: Map<string, { position: Vector3 }>;
    };

    await offStage.init();

    let offSession = createNewSession();
    offStage.setAnimationMode("off");
    offStage.update(
      buildRenderState({
        fen: offSession.snapshot.fen,
        moveEntries: offSession.moveEntries,
        redoStack: offSession.redoStack,
      }),
    );

    offSession = applyPlayerMove(offSession, "e2", "e4")!;
    offStage.update(
      buildRenderState({
        fen: offSession.snapshot.fen,
        moveEntries: offSession.moveEntries,
        redoStack: offSession.redoStack,
      }),
    );

    expect(offStageInternals.activeStageTransition).toBeNull();
    expect(offStageInternals.pieceBySquare.get("e4")?.position.toArray()).toEqual([0.5, 0, 0.5]);
  });

  it("animates camera presets and crossfades between 3D pieces and 2D sprites", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      activeCameraTransition: {
        durationMs: number;
        startedAt: number;
      } | null;
      cameraPreset: string;
      viewMode: string;
      pieceRepresentationOpacity: number;
      spriteRepresentationOpacity: number;
      controls: {
        enableRotate: boolean;
      };
      pieceBySquare: Map<string, { userData: { sprite?: unknown } }>;
      updateCameraTransition: (now: number) => void;
    };

    await stage.init();
    stage.update(buildRenderState({ fen: createNewSession().snapshot.fen }));

    stage.setAnimationMode("normal");
    stage.setCameraPreset("2d");

    expect(stageInternals.activeCameraTransition).not.toBeNull();
    expect(stageInternals.viewMode).toBe("2d");

    const halfStep =
      stageInternals.activeCameraTransition!.startedAt +
      stageInternals.activeCameraTransition!.durationMs / 2;
    stageInternals.updateCameraTransition(halfStep);

    expect(stageInternals.pieceRepresentationOpacity).toBeGreaterThan(0);
    expect(stageInternals.pieceRepresentationOpacity).toBeLessThan(1);
    expect(stageInternals.spriteRepresentationOpacity).toBeGreaterThan(0);
    expect(stageInternals.spriteRepresentationOpacity).toBeLessThan(1);

    stageInternals.updateCameraTransition(
      stageInternals.activeCameraTransition!.startedAt +
        stageInternals.activeCameraTransition!.durationMs,
    );

    expect(stageInternals.activeCameraTransition).toBeNull();
    expect(stageInternals.cameraPreset).toBe("2d");
    expect(stageInternals.viewMode).toBe("2d");
    expect(stageInternals.pieceRepresentationOpacity).toBe(0);
    expect(stageInternals.spriteRepresentationOpacity).toBe(1);
    expect(stageInternals.controls.enableRotate).toBe(false);
    const pawn = stageInternals.pieceBySquare.get("a2")!;
    const pawnMesh = findFirstMesh(pawn as unknown as { traverse: (callback: (child: unknown) => void) => void });
    expect(pawnMesh.visible).toBe(false);
    expect(pawnMesh.material).toMatchObject({ depthWrite: false });
    expect(pawn.userData.sprite).toMatchObject({
      material: expect.objectContaining({ depthTest: false }),
    });

    stage.setAnimationMode("off");
    stage.setCameraPreset("classic");

    expect(stageInternals.cameraPreset).toBe("classic");
    expect(stageInternals.viewMode).toBe("3d");
    expect(stageInternals.pieceRepresentationOpacity).toBe(1);
    expect(stageInternals.spriteRepresentationOpacity).toBe(0);
    expect(stageInternals.controls.enableRotate).toBe(true);
  });

  it("offsets the camera projection to keep presets centered in the visible viewport", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      camera: {
        projectionMatrix: {
          elements: number[];
        };
      };
    };

    await stage.init();
    stage.setViewportPadding({ top: 72, right: 180, bottom: 96, left: 36 });

    expect(stageInternals.camera.projectionMatrix.elements[8]).toBeCloseTo((180 - 36) / 600, 5);
    expect(stageInternals.camera.projectionMatrix.elements[9]).toBeCloseTo((72 - 96) / 600, 5);
  });

  it("prepares placeholder sprite textures for all 12 piece variants", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      spriteTextures: Map<string, Texture>;
    };

    await stage.init();
    const session = createNewSession();
    stage.update(buildRenderState({ fen: session.snapshot.fen }));

    expect(stageInternals.spriteTextures.size).toBe(12);
    expect(stageInternals.spriteTextures.has("w-k")).toBe(true);
    expect(stageInternals.spriteTextures.has("b-q")).toBe(true);
    expect(stageInternals.spriteTextures.has("w-p")).toBe(true);
    expect(stageInternals.spriteTextures.has("b-n")).toBe(true);
  });

  it("maps board-local points to squares without changing existing raycast math", () => {
    expect(resolveSquareFromBoardPoint(-3.5, 3.5)).toBe("a1");
    expect(resolveSquareFromBoardPoint(3.5, -3.5)).toBe("h8");
    expect(resolveSquareFromBoardPoint(4.2, 0)).toBeNull();
  });

  it("selects only on pointerup when travel stays inside the click threshold", () => {
    const { onSquareSelect, stage } = createStage();
    const stageInternals = stage as unknown as {
      currentState: Parameters<ChessStage["update"]>[0] | null;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    const intersectSpy = vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { point: new Vector3(-3.5, 0.03, 3.5) },
    ] as never);
    stageInternals.currentState = buildRenderState();

    stageInternals.handlePointerDown(pointerEvent(1, 100, 100));

    expect(intersectSpy).not.toHaveBeenCalled();

    stageInternals.handlePointerMove(pointerEvent(1, 103, 104));
    stageInternals.handlePointerUp(pointerEvent(1, 104, 104));

    expect(intersectSpy).toHaveBeenCalledTimes(1);
    expect(onSquareSelect).toHaveBeenCalledTimes(1);
    expect(onSquareSelect).toHaveBeenCalledWith("a1");
  });

  it("does not raycast or select after an orbit-sized drag", () => {
    const { onSquareSelect, stage } = createStage();
    const stageInternals = stage as unknown as {
      currentState: Parameters<ChessStage["update"]>[0] | null;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    const intersectSpy = vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { point: new Vector3(-3.5, 0.03, 3.5) },
    ] as never);
    stageInternals.currentState = buildRenderState();

    stageInternals.handlePointerDown(pointerEvent(7, 100, 100));
    stageInternals.handlePointerMove(pointerEvent(7, 118, 100));
    stageInternals.handlePointerUp(pointerEvent(7, 118, 100));

    expect(intersectSpy).not.toHaveBeenCalled();
    expect(onSquareSelect).not.toHaveBeenCalled();
  });

  it("reserves one-finger touch for gameplay and keeps two-finger touch for camera", () => {
    const { onSquareSelect, stage } = createStage();
    const stageInternals = stage as unknown as {
      controls: { touches: { ONE?: number | null; TWO?: number | null } };
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    let point = new Vector3(0.5, 0.03, 2.5);
    vi.spyOn(Raycaster.prototype, "intersectObject").mockImplementation(
      () => [{ point }] as never,
    );

    expect(stageInternals.controls.touches.ONE).toBeNull();
    expect(stageInternals.controls.touches.TWO).toBe(TOUCH.DOLLY_ROTATE);

    stageInternals.handlePointerDown(pointerEvent(11, 100, 100, "touch"));
    point = new Vector3(0.5, 0.03, 0.5);
    stageInternals.handlePointerDown(pointerEvent(12, 120, 120, "touch"));
    stageInternals.handlePointerUp(pointerEvent(11, 100, 100, "touch"));
    stageInternals.handlePointerUp(pointerEvent(12, 120, 120, "touch"));

    expect(onSquareSelect).not.toHaveBeenCalled();
  });

  it("starts a touch drag from a player piece and emits the drop target only when the store marks it legal", async () => {
    const { onSquareSelect, stage } = createStage();
    const stageInternals = stage as unknown as {
      dragState: unknown;
      returnAnimation: unknown;
      pieceBySquare: Map<string, { position: Vector3 }>;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    let point = new Vector3(0.5, 0.03, 2.5);
    vi.spyOn(Raycaster.prototype, "intersectObject").mockImplementation(
      () => [{ point }] as never,
    );

    await stage.init();
    stage.update(
      buildRenderState({
        fen: "8/8/8/8/8/8/4P3/8 w - - 0 1",
      }),
    );

    stageInternals.handlePointerDown(pointerEvent(21, 100, 100, "touch"));
    point = new Vector3(0.5, 0.03, 0.5);
    stageInternals.handlePointerMove(pointerEvent(21, 120, 120, "touch"));

    stage.update(
      buildRenderState({
        fen: "8/8/8/8/8/8/4P3/8 w - - 0 1",
        selectedSquare: "e2",
        legalTargets: ["e4"],
      }),
    );

    stageInternals.handlePointerUp(pointerEvent(21, 120, 120, "touch"));

    expect(onSquareSelect).toHaveBeenNthCalledWith(1, "e2");
    expect(onSquareSelect).toHaveBeenNthCalledWith(2, "e4");
    expect(stageInternals.dragState).toBeNull();
    expect(stageInternals.returnAnimation).toBeNull();
    expect(stageInternals.pieceBySquare.get("e2")?.position.toArray()).toEqual([0.5, 0, 0.5]);
  });

  it("returns a dragged piece to origin when the drop target is not legal", async () => {
    const { onSquareSelect, stage } = createStage();
    const stageInternals = stage as unknown as {
      dragState: unknown;
      returnAnimation: { to: Vector3 } | null;
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    let point = new Vector3(0.5, 0.03, 2.5);
    vi.spyOn(Raycaster.prototype, "intersectObject").mockImplementation(
      () => [{ point }] as never,
    );

    await stage.init();
    stage.update(
      buildRenderState({
        fen: "8/8/8/8/8/8/4P3/8 w - - 0 1",
      }),
    );

    stageInternals.handlePointerDown(pointerEvent(31, 100, 100, "touch"));
    point = new Vector3(0.5, 0.03, 0.5);
    stageInternals.handlePointerMove(pointerEvent(31, 120, 120, "touch"));

    stage.update(
      buildRenderState({
        fen: "8/8/8/8/8/8/4P3/8 w - - 0 1",
        selectedSquare: "e2",
        legalTargets: ["e3"],
      }),
    );

    stageInternals.handlePointerUp(pointerEvent(31, 120, 120, "touch"));

    expect(onSquareSelect).toHaveBeenCalledTimes(1);
    expect(onSquareSelect).toHaveBeenCalledWith("e2");
    expect(stageInternals.dragState).toBeNull();
    expect(stageInternals.returnAnimation?.to.toArray()).toEqual([0.5, 0, 2.5]);
  });

  it("disposes previous highlight resources before rebuilding them", () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      highlightGroup: { children: Mesh[] };
      updateHighlights: (state: unknown) => void;
    };
    const theme = {
      highlightPrimary: "#ffcc00",
      highlightSecondary: "#55ffee",
    };

    stageInternals.updateHighlights({
      selectedSquare: "e4",
      legalTargets: [],
      hintMove: null,
      theme,
    });

    const previousHighlight = stageInternals.highlightGroup.children[0];
    const geometryDispose = vi.spyOn(previousHighlight.geometry, "dispose");
    const materialDispose = vi.spyOn(previousHighlight.material as { dispose: () => void }, "dispose");

    stageInternals.updateHighlights({
      selectedSquare: "d4",
      legalTargets: [],
      hintMove: null,
      theme,
    });

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it("applies boardLight, boardDark, and boardFrame to the premium board materials", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      lightSquareMats: Array<{
        map: Texture | null;
        userData: { boardPalette?: unknown };
      }>;
      darkSquareMats: Array<{
        map: Texture | null;
        userData: { boardPalette?: unknown };
      }>;
      frameMats: Array<{
        map: Texture | null;
        userData: { boardPalette?: unknown };
      }>;
      update: (state: unknown) => void;
    };

    await stage.init();

    const emptyBoardFen = "8/8/8/8/8/8/8/8 w - - 0 1";
    stage.update(buildRenderState({ fen: emptyBoardFen, theme: themes[0] }));

    const previousLightMap = stageInternals.lightSquareMats[0].map!;
    const previousDarkMap = stageInternals.darkSquareMats[0].map!;
    const previousFrameMap = stageInternals.frameMats[0].map!;
    const previousLightDispose = vi.spyOn(previousLightMap, "dispose");
    const previousDarkDispose = vi.spyOn(previousDarkMap, "dispose");
    const previousFrameDispose = vi.spyOn(previousFrameMap, "dispose");
    const expectedPalette = deriveBoardPalette(themes[1]);

    stage.update(buildRenderState({ fen: emptyBoardFen, theme: themes[1] }));

    expect(previousLightDispose).toHaveBeenCalledTimes(1);
    expect(previousDarkDispose).toHaveBeenCalledTimes(1);
    expect(previousFrameDispose).toHaveBeenCalledTimes(1);
    expect(stageInternals.lightSquareMats[0].map).not.toBe(previousLightMap);
    expect(stageInternals.darkSquareMats[0].map).not.toBe(previousDarkMap);
    expect(stageInternals.frameMats[0].map).not.toBe(previousFrameMap);
    expect(stageInternals.lightSquareMats[0].userData.boardPalette).toMatchObject(
      expectedPalette.lightSquares,
    );
    expect(stageInternals.darkSquareMats[0].userData.boardPalette).toMatchObject(
      expectedPalette.darkSquares,
    );
    expect(stageInternals.frameMats[0].userData.boardPalette).toMatchObject(
      expectedPalette.frame,
    );
  });

  it("keeps the renderer transparent while applying canvasFog to the stage atmosphere", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      scene: { fog: FogExp2 | null };
      update: (state: unknown) => void;
    };

    await stage.init();

    stage.update(buildRenderState({ theme: themes[2] }));

    expect(latestRendererOptions).toMatchObject({ alpha: true });
    expect(stageInternals.scene.fog).toBeInstanceOf(FogExp2);
    expect(stageInternals.scene.fog?.color.getHexString()).toBe(
      new Color(themes[2].canvasFog).getHexString(),
    );
  });

  it("uses a restrained lighting rig so piece volume and shadows remain readable", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      renderer: { toneMappingExposure: number };
      scene: { children: unknown[] };
    };

    await stage.init();

    const hemi = stageInternals.scene.children.find((child) => child instanceof HemisphereLight);
    const spots = stageInternals.scene.children.filter((child) => child instanceof SpotLight);
    const rim = stageInternals.scene.children.find((child) => child instanceof DirectionalLight);

    expect(stageInternals.renderer.toneMappingExposure).toBeCloseTo(0.95);
    expect(hemi).toMatchObject({ intensity: 0.04 });
    expect(spots).toHaveLength(3);
    expect(spots[0]).toMatchObject({ castShadow: true, intensity: 380 });
    expect(spots[1]).toMatchObject({ castShadow: true, intensity: 100 });
    expect(spots[2]).toMatchObject({ castShadow: false, intensity: 12 });
    expect(rim).toMatchObject({ intensity: 0.8 });
  });

  it("releases stage-owned resources during final disposal", async () => {
    const { stage } = createStage();
    const stageInternals = stage as unknown as {
      environmentTarget: { texture: Texture; dispose: ReturnType<typeof vi.fn> } | null;
      hitPlane: Mesh;
      lightPieceMat: { dispose: () => void };
      prototypes: Map<string, { traverse: (callback: (child: unknown) => void) => void }>;
    };

    await stage.init();

    const environmentTarget = stageInternals.environmentTarget;
    const hitPlaneGeometryDispose = vi.spyOn(stageInternals.hitPlane.geometry, "dispose");
    const hitPlaneMaterialDispose = vi.spyOn(
      stageInternals.hitPlane.material as { dispose: () => void },
      "dispose",
    );
    const lightPieceMatDispose = vi.spyOn(stageInternals.lightPieceMat, "dispose");
    const prototypeMesh = findFirstMesh(stageInternals.prototypes.get("p")!);
    const prototypeGeometryDispose = vi.spyOn(prototypeMesh.geometry, "dispose");

    stage.dispose();

    expect(environmentTarget).not.toBeNull();
    expect(environmentTarget?.dispose).toHaveBeenCalledTimes(1);
    expect(hitPlaneGeometryDispose).toHaveBeenCalledTimes(1);
    expect(hitPlaneMaterialDispose).toHaveBeenCalledTimes(1);
    expect(lightPieceMatDispose).toHaveBeenCalledTimes(1);
    expect(prototypeGeometryDispose).toHaveBeenCalledTimes(1);
  });
});
