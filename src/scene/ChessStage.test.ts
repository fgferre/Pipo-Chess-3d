import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Color, FogExp2, Mesh, Raycaster, Texture, TOUCH, Vector3 } from "three";
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
    enableDamping = false;
    dampingFactor = 0;
    maxPolarAngle = 0;
    minDistance = 0;
    maxDistance = 0;
    touches = { ONE: 0, TWO: 2 };

    update = vi.fn();
    dispose = vi.fn();

    constructor(camera: unknown, domElement: HTMLElement) {
      void camera;
      void domElement;
    }
  },
}));

import { ChessStage, deriveBoardPalette, resolveSquareFromBoardPoint } from "./ChessStage";

const stages: ChessStage[] = [];

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
}

function createCanvasContextMock(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    lineCap: "round",
    lineJoin: "round",
    lineWidth: 1,
    strokeStyle: "",
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
