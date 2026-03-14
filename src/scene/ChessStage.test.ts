import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Color, FogExp2, Mesh, Raycaster, Texture, Vector3 } from "three";
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

function pointerEvent(pointerId: number, clientX: number, clientY: number): PointerEvent {
  return { pointerId, clientX, clientY } as PointerEvent;
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
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    const intersectSpy = vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { point: new Vector3(-3.5, 0.03, 3.5) },
    ] as never);

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
      handlePointerDown: (event: PointerEvent) => void;
      handlePointerMove: (event: PointerEvent) => void;
      handlePointerUp: (event: PointerEvent) => void;
    };
    const intersectSpy = vi.spyOn(Raycaster.prototype, "intersectObject").mockReturnValue([
      { point: new Vector3(-3.5, 0.03, 3.5) },
    ] as never);

    stageInternals.handlePointerDown(pointerEvent(7, 100, 100));
    stageInternals.handlePointerMove(pointerEvent(7, 118, 100));
    stageInternals.handlePointerUp(pointerEvent(7, 118, 100));

    expect(intersectSpy).not.toHaveBeenCalled();
    expect(onSquareSelect).not.toHaveBeenCalled();
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
    stage.update({
      fen: emptyBoardFen,
      orientation: "white",
      theme: themes[0],
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });

    const previousLightMap = stageInternals.lightSquareMats[0].map!;
    const previousDarkMap = stageInternals.darkSquareMats[0].map!;
    const previousFrameMap = stageInternals.frameMats[0].map!;
    const previousLightDispose = vi.spyOn(previousLightMap, "dispose");
    const previousDarkDispose = vi.spyOn(previousDarkMap, "dispose");
    const previousFrameDispose = vi.spyOn(previousFrameMap, "dispose");
    const expectedPalette = deriveBoardPalette(themes[1]);

    stage.update({
      fen: emptyBoardFen,
      orientation: "white",
      theme: themes[1],
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });

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

    stage.update({
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      orientation: "white",
      theme: themes[2],
      selectedSquare: null,
      legalTargets: [],
      hintMove: null,
    });

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
