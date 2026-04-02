import {
  type ComponentProps,
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { type Color, type PieceSymbol, type Square } from "chess.js";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useShallow } from "zustand/shallow";
import { soundService } from "./audio/soundService";
import { haptics } from "./hooks/useHaptics";
import {
  ActionButton,
  ChipButton,
  ClockPill,
  type ClockSideState,
  MenuSection,
} from "./components/AppShellPrimitives";
import { AnalysisSummaryView } from "./components/AnalysisSummaryView";
import { CameraPickerPanel } from "./components/CameraPickerPanel";
import { ReplaceGameDialog, ResultModalOverlay } from "./components/DecisionOverlays";
import { HistoryPanel } from "./components/HistoryPanel";
import { clockPresets } from "./data/clocks";
import { difficultyPresets, getDifficultyPreset } from "./data/difficulties";
import { getTheme, getThemeCssVariables, themes } from "./data/themes";
import {
  deriveSessionAtPly,
  formatIllegalMoveDiagnosis,
  getCheckedKingSquare,
} from "./game/gameService";
import { getLocaleLabel, t } from "./i18n";
import { locales } from "./i18n/dictionaries";
import type { SceneLoadState } from "./scene/SceneAdapter";
import { useGameStore } from "./state/gameStore";
import type {
  CameraPreset,
  ClockConfig,
  EnginePhase,
  GameSession,
  InteractionBlockReason,
  NewGameColorChoice,
  PositionEvaluation,
} from "./types/game";
import { clamp, formatAbsoluteTimestamp, formatClock, formatRelativeTimestamp } from "./utils/format";
import { exportTextContent, readTextFile, type ExportTextResult } from "./utils/files";
import { getPromotionPopupStyle } from "./utils/overlays";

type TranslationKey = Parameters<typeof t>[1];
type ShellMode = "desktop" | "mobile";
type MenuView = "root" | "analysis" | "visual" | "library";
type OverlayMotionMode = "normal" | "reduced" | "off";
type TransientToastTone = "notice" | "error" | "passive" | "checkmate";
type AppToast = {
  actionLabel?: string;
  icon: string;
  message: string;
  onAction?: () => void;
  tone: TransientToastTone;
};
type BoardCueTone = "invalid" | "blocked" | "castling-blocked";
type ShellActionSpec = Omit<ComponentProps<typeof ActionButton>, "compact" | "labelVisibility"> & {
  desktopCompact?: boolean;
  desktopLabelVisibility?: "adaptive" | "always" | "hidden";
  mobileVisible?: boolean;
};
const SHELL_MEDIA_QUERY = "(max-width: 899px)";
const LOW_TIME_WARNING_MS = 30_000;
const LOW_TIME_CRITICAL_MS = 10_000;

const NEW_GAME_CLOCK_PRESETS = clockPresets;
const CAMERA_PRESETS: Array<{ id: CameraPreset; icon: string; labelKey: TranslationKey }> = [
  { id: "classic", icon: "◢", labelKey: "camera.classic" },
  { id: "side", icon: "▤", labelKey: "camera.side" },
  { id: "topdown", icon: "▣", labelKey: "camera.topdown" },
  { id: "2d", icon: "□", labelKey: "camera.2d" },
];
const QUALITY_PRESETS: Array<
  | { id: "auto"; labelKey: TranslationKey }
  | { id: "eco"; labelKey: TranslationKey; tier: 1 }
  | { id: "high"; labelKey: TranslationKey; tier: 2 }
  | { id: "ultra"; labelKey: TranslationKey; tier: 3 }
> = [
  { id: "auto", labelKey: "quality.auto" },
  { id: "eco", labelKey: "quality.eco", tier: 1 },
  { id: "high", labelKey: "quality.high", tier: 2 },
  { id: "ultra", labelKey: "quality.ultra", tier: 3 },
];
const PROMOTION_CHOICES = ["q", "r", "b", "n"] as const;
const INITIAL_SCENE_LOAD_STATE: SceneLoadState = {
  phase: "idle",
  progress: 0,
  messageKey: "scene.loading.renderer",
};
const ChessScene = lazy(async () => {
  const module = await import("./components/ChessScene");
  return { default: module.ChessScene };
});

function getShellMode(): ShellMode {
  if (typeof window === "undefined") {
    return "desktop";
  }

  if (typeof window.matchMedia === "function") {
    return window.matchMedia(SHELL_MEDIA_QUERY).matches ? "mobile" : "desktop";
  }

  return window.innerWidth < 900 ? "mobile" : "desktop";
}

function useAppStoreState() {
  return useGameStore(
    useShallow((state) => ({
      booted: state.booted,
      enginePhase: state.enginePhase,
      engineMessage: state.engineMessage,
      session: state.session,
      autosave: state.autosave,
      saveSlots: state.saveSlots,
      selectedSquare: state.selectedSquare,
      legalTargets: state.legalTargets,
      castlingTargets: state.castlingTargets,
      hintMove: state.hintMove,
      pendingPromotion: state.pendingPromotion,
      currentRepetitionCount: state.currentRepetitionCount,
      fiftyMoveRulePressure: state.fiftyMoveRulePressure,
      lowTimeState: state.lowTimeState,
      analysisCursor: state.analysisCursor,
      analysisAutoplay: state.analysisAutoplay,
      analysisProgress: state.analysisProgress,
      cameraPreset: state.cameraPreset,
      restoreNotice: state.restoreNotice,
      lastError: state.lastError,
    })),
  );
}

function useAppStoreActions() {
  return useGameStore(
    useShallow((state) => ({
      bootstrap: state.bootstrap,
      selectSquare: state.selectSquare,
      confirmPromotion: state.confirmPromotion,
      retryEngine: state.retryEngine,
      requestHint: state.requestHint,
      undo: state.undo,
      redo: state.redo,
      newGame: state.newGame,
      setTheme: state.setTheme,
      setLocale: state.setLocale,
      toggleOrientation: state.toggleOrientation,
      setShowCoordinates: state.setShowCoordinates,
      setAnimationMode: state.setAnimationMode,
      setDefaultViewMode: state.setDefaultViewMode,
      setCameraSensitivity: state.setCameraSensitivity,
      setQualityMode: state.setQualityMode,
      setQualityTier: state.setQualityTier,
      setSoundEnabled: state.setSoundEnabled,
      setSoundVolume: state.setSoundVolume,
      setHapticsEnabled: state.setHapticsEnabled,
      setCameraPreset: state.setCameraPreset,
      setAnalysisCursor: state.setAnalysisCursor,
      setAnalysisAutoplay: state.setAnalysisAutoplay,
      clearRestoreNotice: state.clearRestoreNotice,
      createManualSave: state.createManualSave,
      loadManualSave: state.loadManualSave,
      restoreAutosave: state.restoreAutosave,
      deleteManualSave: state.deleteManualSave,
      importPgnText: state.importPgnText,
      runAnalysis: state.runAnalysis,
      persistCurrentAutosave: state.persistCurrentAutosave,
      tickLiveClock: state.tickLiveClock,
    })),
  );
}

function useAppShellController({
  clockConfig,
  difficultyId,
}: {
  clockConfig: ClockConfig;
  difficultyId: string;
}) {
  const [shellMode, setShellMode] = useState<ShellMode>(() => getShellMode());
  const [topBarExpanded, setTopBarExpanded] = useState(false);
  const [bottomBarExpanded, setBottomBarExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>("root");
  const [newGameOpen, setNewGameOpen] = useState(false);
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const [replacePromptOpen, setReplacePromptOpen] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [newGameColor, setNewGameColor] = useState<NewGameColorChoice>("white");
  const [newGameDifficultyId, setNewGameDifficultyId] = useState(difficultyPresets[0].id);
  const [selectedClockKey, setSelectedClockKey] = useState("custom");
  const [customMinutes, setCustomMinutes] = useState("10");
  const [customIncrement, setCustomIncrement] = useState("0");
  const [isZenMode, setIsZenMode] = useState(false);
  const isMobileShell = shellMode === "mobile";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof window.matchMedia === "function") {
      const mediaQuery = window.matchMedia(SHELL_MEDIA_QUERY);
      const syncShellMode = (matches: boolean) => {
        setShellMode(matches ? "mobile" : "desktop");
        if (matches) {
          setTopBarExpanded(false);
          setBottomBarExpanded(false);
        }
      };
      const handleChange = (event: MediaQueryListEvent) => {
        syncShellMode(event.matches);
      };

      syncShellMode(mediaQuery.matches);

      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
      }

      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    const syncShellMode = () => {
      const nextMode = getShellMode();
      setShellMode(nextMode);
      if (nextMode === "mobile") {
        setTopBarExpanded(false);
        setBottomBarExpanded(false);
      }
    };
    syncShellMode();
    window.addEventListener("resize", syncShellMode);
    return () => window.removeEventListener("resize", syncShellMode);
  }, []);

  useEffect(() => {
    syncNewGameForm(
      clockConfig,
      difficultyId,
      setNewGameDifficultyId,
      setSelectedClockKey,
      setCustomMinutes,
      setCustomIncrement,
    );
  }, [clockConfig, difficultyId]);

  const closeMenu = useCallback(() => {
    startTransition(() => {
      setMenuOpen(false);
      setMenuView("root");
    });
  }, []);

  const toggleMenu = useCallback(() => {
    startTransition(() => {
      setMenuOpen((value) => {
        const nextOpen = !value;
        if (nextOpen) {
          setCameraPickerOpen(false);
          setHistoryOpen(false);
          setNewGameOpen(false);
        }
        setMenuView("root");
        return nextOpen;
      });
    });
  }, []);

  const toggleCameraPicker = useCallback(() => {
    startTransition(() => {
      setCameraPickerOpen((value) => {
        const nextOpen = !value;
        if (nextOpen) {
          setMenuOpen(false);
          setMenuView("root");
          setHistoryOpen(false);
          setNewGameOpen(false);
        }
        return nextOpen;
      });
    });
  }, []);

  const closeCameraPicker = useCallback(() => {
    startTransition(() => {
      setCameraPickerOpen(false);
    });
  }, []);

  const toggleHistory = useCallback(() => {
    startTransition(() => {
      setHistoryOpen((value) => {
        const willOpen = !value;
        if (willOpen) {
          setMenuOpen(false);
          setMenuView("root");
          setCameraPickerOpen(false);
          if (isMobileShell) {
            setBottomBarExpanded(false);
          }
        }
        return willOpen;
      });
    });
  }, [isMobileShell]);

  return {
    shellMode,
    isMobileShell,
    topBarExpanded,
    setTopBarExpanded,
    bottomBarExpanded,
    setBottomBarExpanded,
    historyOpen,
    setHistoryOpen,
    menuOpen,
    setMenuOpen,
    menuView,
    setMenuView,
    newGameOpen,
    setNewGameOpen,
    cameraPickerOpen,
    setCameraPickerOpen,
    replacePromptOpen,
    setReplacePromptOpen,
    resultModalOpen,
    setResultModalOpen,
    newGameColor,
    setNewGameColor,
    newGameDifficultyId,
    setNewGameDifficultyId,
    selectedClockKey,
    setSelectedClockKey,
    customMinutes,
    setCustomMinutes,
    customIncrement,
    setCustomIncrement,
    isZenMode,
    setIsZenMode,
    closeMenu,
    toggleMenu,
    toggleCameraPicker,
    closeCameraPicker,
    toggleHistory,
  };
}

function PresenceAwareOverlayBackdrop({
  motionMode,
  onClick,
  visible,
}: {
  motionMode: OverlayMotionMode;
  onClick: () => void;
  visible: boolean;
}) {
  const isPresent = useIsPresent();
  const backdropMotion = getBackdropMotionProps(motionMode);

  return (
    <motion.div
      className={visible ? "overlay-scrim" : undefined}
      aria-hidden="true"
      initial={backdropMotion.initial}
      animate={backdropMotion.animate}
      exit={backdropMotion.exit}
      transition={backdropMotion.transition}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: isPresent ? "auto" : "none",
        ...(visible ? {} : { background: "transparent" }),
      }}
      onClick={onClick}
    />
  );
}

function BaseOverlay({
  children,
  motionMode,
  onClose,
  showScrim = true,
  blockInteraction = showScrim,
  dismissibleBackdrop = showScrim,
  testId,
}: {
  children: ReactNode;
  motionMode: OverlayMotionMode;
  onClose: () => void;
  showScrim?: boolean;
  blockInteraction?: boolean;
  dismissibleBackdrop?: boolean;
  testId?: string;
}) {
  const isPresent = useIsPresent();
  const usesBackdropPointerLayer = dismissibleBackdrop;

  return (
    <div
      className="base-overlay"
      data-overlay-blocking={blockInteraction ? "true" : "false"}
      data-overlay-scrim={showScrim ? "visible" : "hidden"}
      data-testid={testId}
      inert={!isPresent || undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        pointerEvents: usesBackdropPointerLayer
          ? "none"
          : blockInteraction && isPresent
            ? "auto"
            : "none",
      }}
    >
      {dismissibleBackdrop ? (
        <PresenceAwareOverlayBackdrop motionMode={motionMode} onClick={onClose} visible={showScrim} />
      ) : null}
      {children}
    </div>
  );
}

function PresenceAwareNewGameSheet({
  ariaLabel,
  children,
  motionMode,
  presentation,
}: {
  ariaLabel: string;
  children: ReactNode;
  motionMode: OverlayMotionMode;
  presentation: "desktop-modal" | "mobile-sheet";
}) {
  const isPresent = useIsPresent();
  const motionProps = getSheetMotionProps(motionMode, presentation);

  return (
    <motion.section
      className="new-game-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      data-presentation={presentation}
      data-testid="new-game-sheet"
      initial={motionProps.initial}
      animate={motionProps.animate}
      exit={motionProps.exit}
      transition={motionProps.transition}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
    >
      {children}
    </motion.section>
  );
}

function App() {
  const systemPrefersReducedMotion = useReducedMotion();
  const {
    booted,
    enginePhase,
    engineMessage,
    session,
    autosave,
    saveSlots,
    selectedSquare,
    legalTargets,
    castlingTargets,
    hintMove,
    pendingPromotion,
    currentRepetitionCount,
    fiftyMoveRulePressure,
    lowTimeState,
    analysisCursor,
    analysisAutoplay,
    analysisProgress,
    cameraPreset,
    restoreNotice,
    lastError,
  } = useAppStoreState();
  const {
    bootstrap,
    selectSquare,
    confirmPromotion,
    retryEngine,
    requestHint,
    undo,
    redo,
    newGame,
    setTheme,
    setLocale,
    toggleOrientation,
    setShowCoordinates,
    setAnimationMode,
    setDefaultViewMode,
    setCameraSensitivity,
    setQualityMode,
    setQualityTier,
    setSoundEnabled,
    setSoundVolume,
    setHapticsEnabled,
    setCameraPreset,
    setAnalysisCursor,
    setAnalysisAutoplay,
    clearRestoreNotice,
    createManualSave,
    loadManualSave,
    restoreAutosave,
    deleteManualSave,
    importPgnText,
    runAnalysis,
    persistCurrentAutosave,
    tickLiveClock,
  } = useAppStoreActions();
  const {
    shellMode,
    isMobileShell,
    topBarExpanded,
    setTopBarExpanded,
    bottomBarExpanded,
    setBottomBarExpanded,
    historyOpen,
    setHistoryOpen,
    menuOpen,
    setMenuOpen,
    menuView,
    setMenuView,
    newGameOpen,
    setNewGameOpen,
    cameraPickerOpen,
    setCameraPickerOpen,
    replacePromptOpen,
    setReplacePromptOpen,
    resultModalOpen,
    setResultModalOpen,
    newGameColor,
    setNewGameColor,
    newGameDifficultyId,
    setNewGameDifficultyId,
    selectedClockKey,
    setSelectedClockKey,
    customMinutes,
    setCustomMinutes,
    customIncrement,
    setCustomIncrement,
    isZenMode,
    setIsZenMode,
    closeMenu,
    toggleMenu,
    toggleCameraPicker,
    closeCameraPicker,
    toggleHistory,
  } = useAppShellController({
    clockConfig: session.settings.clockConfig,
    difficultyId: session.settings.difficultyId,
  });
  const [transientToast, setTransientToast] = useState<AppToast | null>(null);
  const [promotionAnchor, setPromotionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [promotionSelection, setPromotionSelection] = useState<(typeof PROMOTION_CHOICES)[number] | null>(null);
  const [invalidMoveSquare, setInvalidMoveSquare] = useState<Square | null>(null);
  const [invalidMoveSummary, setInvalidMoveSummary] = useState<string | null>(null);
  const [invalidMoveDetail, setInvalidMoveDetail] = useState<string | null>(null);
  const [invalidMoveTone, setInvalidMoveTone] = useState<BoardCueTone>("invalid");
  const [invalidMoveIcon, setInvalidMoveIcon] = useState("!");
  const [invalidMoveExpanded, setInvalidMoveExpanded] = useState(false);
  const [invalidMoveAnchor, setInvalidMoveAnchor] = useState<{ x: number; y: number } | null>(null);
  const [checkAnchor, setCheckAnchor] = useState<{ x: number; y: number } | null>(null);
  const [castlingAnchor, setCastlingAnchor] = useState<{ x: number; y: number } | null>(null);
  const [sceneLoadState, setSceneLoadState] = useState<SceneLoadState>(INITIAL_SCENE_LOAD_STATE);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFinishedGameRef = useRef<string | null>(null);
  const lowTimeToastRef = useRef<{ b: boolean; w: boolean }>({ w: false, b: false });
  const repetitionToastShownRef = useRef(false);
  const fiftyMoveToastShownRef = useRef<"normal" | "warning" | "critical" | "draw">("normal");
  const deferredMoves = useDeferredValue(session.snapshot.moveList);
  const locale = session.settings.locale;
  const theme = getTheme(session.settings.themeId);
  const style = getThemeCssVariables(theme) as CSSProperties;
  const qualityMode = session.settings.qualityMode;
  const manualQualityTier = session.settings.manualQualityTier;
  const activeDifficulty = getDifficultyPreset(session.settings.difficultyId);
  const boardSession = analysisCursor === null ? session : deriveSessionAtPly(session, analysisCursor);
  const analysisMode = analysisCursor !== null;
  const motionMode = resolveOverlayMotionMode(session.settings.animationMode, !!systemPrefersReducedMotion);
  const handleApplyPwaUpdate = useCallback(() => {
    setNeedRefresh(false);
    void updateServiceWorker(true);
  }, [setNeedRefresh, updateServiceWorker]);
  const handleRetryEngine = useCallback(() => {
    void retryEngine();
  }, [retryEngine]);
  const updateReadyToast: AppToast | null = needRefresh
    ? {
        icon: "↻",
        message: t(locale, "pwa.updateReady"),
        tone: "notice",
        actionLabel: t(locale, "pwa.reload"),
        onAction: handleApplyPwaUpdate,
      }
    : null;
  const engineErrorToast: AppToast | null =
    enginePhase === "error" && lastError
      ? {
          icon: "!",
          message: lastError,
          tone: "error",
          actionLabel: t(locale, "engine.retry"),
          onAction: handleRetryEngine,
        }
      : null;
  const activeToast = restoreNotice
    ? { icon: "↺", message: restoreNotice, tone: "notice" as const }
    : transientToast ??
      (engineErrorToast ?? (lastError ? { icon: "!", message: lastError, tone: "error" as const } : updateReadyToast));
  const currentPly = analysisCursor ?? session.moveEntries.length;
  const currentEvaluation = getEvaluationForPly(session.analysisSummary?.evaluationsByPly, currentPly);
  const checkedKingSquare = getCheckedKingSquare(boardSession);
  const repetitionCount = currentRepetitionCount;
  const halfmoveClock = fiftyMoveRulePressure.halfmoveClock;
  const autosaveTimestamp = autosave ? formatRelativeTimestamp(autosave.updatedAt, locale) : null;
  const showSceneBootStatus =
    sceneLoadState.phase === "loading" ||
    sceneLoadState.phase === "error" ||
    (booted && sceneLoadState.phase !== "ready");
  const bootProgress = showSceneBootStatus ? sceneLoadState.progress : getBootProgress(enginePhase);
  const bootMeta = showSceneBootStatus
    ? t(locale, sceneLoadState.messageKey)
    : engineMessage || t(locale, getStatusKey(enginePhase));
  const showBootScrim = !booted || sceneLoadState.phase !== "ready";
  const analysisSummaryCount = session.analysisSummary?.criticalMoments.length ?? 0;
  const gameLastMove = session.moveEntries.at(-1);
  const analysisLastMove = analysisMode ? boardSession.moveEntries.at(-1) ?? null : null;
  const boardLastMove =
    analysisMode
      ? analysisLastMove
        ? { from: analysisLastMove.from, to: analysisLastMove.to }
        : null
      : gameLastMove && gameLastMove.color !== session.playerColor
        ? { from: gameLastMove.from, to: gameLastMove.to }
        : null;
  const checkCueTone = session.snapshot.status === "checkmate" ? "checkmate" : "check";
  const checkCueLabel =
    session.snapshot.status === "checkmate" ? getCheckmateLabel(locale) : t(locale, "feedback.check");
  const topColor: Color = session.settings.orientation === "white" ? "b" : "w";
  const bottomColor: Color = session.settings.orientation === "white" ? "w" : "b";
  const isHintDisabled =
    analysisMode ||
    !!pendingPromotion ||
    (session.snapshot.status !== "active" && session.snapshot.status !== "idle") ||
    session.snapshot.sideToMove !== session.playerColor ||
    enginePhase === "thinking" ||
    enginePhase === "analyzing";
  const selectedDifficultyIndex = Math.max(
    0,
    difficultyPresets.findIndex((preset) => preset.id === newGameDifficultyId),
  );
  const selectedNewGameDifficulty = getDifficultyPreset(newGameDifficultyId);
  const clockChoiceCount = NEW_GAME_CLOCK_PRESETS.length + 1;
  const clockChoiceColumns = clockChoiceCount % 2 === 0 ? clockChoiceCount / 2 : clockChoiceCount;
  const clockChoiceGridStyle = { "--clock-columns": clockChoiceColumns } as CSSProperties;
  const analysisSectionSubtitle = getAnalysisSectionSubtitle(
    session,
    locale,
    analysisSummaryCount,
    analysisProgress,
  );
  const librarySectionSubtitle = getLibrarySectionSubtitle(autosaveTimestamp, saveSlots.length, locale);
  const settingsSectionSubtitle = `${theme.label} · ${getLocaleLabel(locale)}`;
  const historySessionSubtitle = t(locale, "section.game.subtitle", {
    difficulty: activeDifficulty.label,
    clock: session.settings.clockConfig.label,
  });
  const historySummary = buildMoveHistorySummary(session, locale);
  const historyProgress = getHistoryProgress(session.moveEntries.length, currentPly, analysisMode);
  const topBarCollapsed = isMobileShell || !topBarExpanded;
  const bottomBarCompact = isMobileShell || !bottomBarExpanded;
  const bottomBarLabelVisibility = isMobileShell ? "hidden" : "adaptive";
  const showOfflineReadyPill = offlineReady && !needRefresh;
  const cameraPresentation = isMobileShell ? "mobile-sheet" : "desktop-popover";
  const newGamePresentation = isMobileShell ? "mobile-sheet" : "desktop-modal";
  const clearDecisionCue = useCallback(() => {
    setInvalidMoveSquare(null);
    setInvalidMoveSummary(null);
    setInvalidMoveDetail(null);
    setInvalidMoveTone("invalid");
    setInvalidMoveIcon("!");
    setInvalidMoveExpanded(false);
  }, []);
  const showTransientFeedback = useCallback((message: string, tone: TransientToastTone, icon: string) => {
    setTransientToast({ message, tone, icon });
  }, []);
  const showBoardFeedback = useCallback(({
    detail = null,
    icon,
    square,
    summary,
    toastTone,
    tone,
  }: {
    detail?: string | null;
    icon: string;
    square: Square;
    summary: string;
    toastTone: TransientToastTone;
    tone: BoardCueTone;
  }) => {
    setInvalidMoveSummary(summary);
    setInvalidMoveDetail(detail);
    setInvalidMoveTone(tone);
    setInvalidMoveIcon(icon);
    setInvalidMoveExpanded(false);
    setInvalidMoveSquare(square);
    showTransientFeedback(summary, toastTone, icon);
    if (tone === "blocked" || tone === "castling-blocked") {
      soundService.blocked();
      haptics.blocked();
      return;
    }

    soundService.invalidMove();
    haptics.invalidMove();
  }, [showTransientFeedback]);
  const handleBoardInteraction = useCallback(async (square: Square) => {
    if (analysisMode) {
      return;
    }

    const outcome = await selectSquare(square);
    if (outcome.kind === "select") {
      clearDecisionCue();
      soundService.select();
      haptics.select();
      return;
    }

    if (outcome.kind === "blocked") {
      clearDecisionCue();
      const blockedFeedback = getBlockedFeedback(outcome.reason, locale);
      showBoardFeedback({
        square: outcome.square,
        summary: blockedFeedback.summary,
        detail: blockedFeedback.detail,
        icon: blockedFeedback.icon,
        tone: "blocked",
        toastTone: "error",
      });
      return;
    }

    if (outcome.kind === "illegal") {
      const formatted = formatIllegalMoveDiagnosis(outcome.diagnosis, locale);
      const castlingBlocked = outcome.diagnosis.reason.startsWith("castling-");

      showBoardFeedback({
        square: outcome.to,
        summary: formatted.summary,
        detail: formatted.detail,
        icon: castlingBlocked ? "♜" : "!",
        tone: castlingBlocked ? "castling-blocked" : "invalid",
        toastTone: "error",
      });
      return;
    }

    if (outcome.kind === "move" || outcome.kind === "promotion" || outcome.kind === "clear") {
      clearDecisionCue();
    }
  }, [analysisMode, clearDecisionCue, locale, selectSquare, showBoardFeedback]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!pendingPromotion) {
      setPromotionSelection(null);
    }
  }, [pendingPromotion]);

  useEffect(() => {
    const preferences = {
      soundEnabled: session.settings.soundEnabled,
      soundVolume: session.settings.soundVolume,
      hapticsEnabled: session.settings.hapticsEnabled,
    };

    soundService.applyPreferences(preferences);
    haptics.applyPreferences(preferences);
  }, [
    session.settings.hapticsEnabled,
    session.settings.soundEnabled,
    session.settings.soundVolume,
  ]);

  useEffect(() => {
    if (isTerminalStatus(session.snapshot.status)) {
      if (lastFinishedGameRef.current !== session.snapshot.pgn) {
        setResultModalOpen(true);
        lastFinishedGameRef.current = session.snapshot.pgn;
        if (session.snapshot.status === "checkmate") {
          soundService.checkmate();
          haptics.checkmate();
        } else {
          soundService.gameOver();
          haptics.gameOver();
        }
      }
      return;
    }

    setResultModalOpen(false);
    lastFinishedGameRef.current = null;
  }, [session.snapshot.pgn, session.snapshot.status, setResultModalOpen]);

  const prevMoveLengthRef = useRef(0);
  useEffect(() => {
    const moveCount = session.moveEntries.length;
    if (!booted) {
      prevMoveLengthRef.current = moveCount;
      return;
    }
    if (moveCount < prevMoveLengthRef.current) {
      prevMoveLengthRef.current = moveCount;
      soundService.undo();
      haptics.undo();
      return;
    }
    if (moveCount === 0 || moveCount === prevMoveLengthRef.current) {
      prevMoveLengthRef.current = moveCount;
      return;
    }
    prevMoveLengthRef.current = moveCount;
    const lastEntry = session.moveEntries[moveCount - 1];
    if (!lastEntry) return;

    const isCastle = lastEntry.san.startsWith("O-O");
    const isCapture = lastEntry.captured !== undefined;
    const isPromotion = lastEntry.promotion !== undefined;
    const isCheckmate = lastEntry.san.includes("#") || session.snapshot.status === "checkmate";

    if (isPromotion) {
      soundService.promotion();
      haptics.promotion();
    } else if (isCapture) {
      soundService.capture();
      haptics.capture();
    } else if (isCastle) {
      soundService.castle();
      haptics.castle();
    } else {
      soundService.move();
      haptics.move();
    }

    if (isCheckmate) {
      window.setTimeout(() => {
        showTransientFeedback(getCheckmateLabel(locale), "checkmate", "#");
      }, 80);
      return;
    }

    if (lastEntry.san.includes("+")) {
      window.setTimeout(() => {
        soundService.check();
        haptics.check();
        showTransientFeedback(t(locale, "feedback.check"), "notice", "+");
      }, 80);
    }
  }, [
    session.moveEntries,
    session.moveEntries.length,
    booted,
    locale,
    session.snapshot.status,
    showTransientFeedback,
  ]);

  useEffect(() => {
    if (!restoreNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      clearRestoreNotice();
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [clearRestoreNotice, restoreNotice]);

  useEffect(() => {
    if (!transientToast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransientToast(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transientToast]);

  useEffect(() => {
    if (!invalidMoveSquare) return;
    const delay = invalidMoveExpanded ? 4000 : 1800;
    const timeout = window.setTimeout(() => {
      clearDecisionCue();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [clearDecisionCue, invalidMoveExpanded, invalidMoveSquare]);

  useEffect(() => {
    if (!session.settings.clockConfig.enabled || analysisMode || session.snapshot.status !== "active") {
      lowTimeToastRef.current = { w: false, b: false };
      return;
    }

    const nextFlags = lowTimeState.byColor;
    const activeColor = session.snapshot.clockState.activeColor;

    if (activeColor && nextFlags[activeColor] && !lowTimeToastRef.current[activeColor]) {
      const side = buildClockSide(activeColor, session, locale);
      soundService.lowTime();
      haptics.lowTime();
      showTransientFeedback(
        getLowTimeToastLabel(locale, side.label, side.time),
        "passive",
        "⌛",
      );
    }

    lowTimeToastRef.current = nextFlags;
  }, [
    analysisMode,
    locale,
    lowTimeState.byColor,
    session,
    session.settings.clockConfig.enabled,
    session.snapshot.clockState.activeColor,
    session.snapshot.status,
    showTransientFeedback,
  ]);

  useEffect(() => {
    if (analysisMode || session.snapshot.status !== "active") {
      repetitionToastShownRef.current = repetitionCount >= 2;
      return;
    }

    if (repetitionCount >= 2 && !repetitionToastShownRef.current) {
      showTransientFeedback(getSecondRepetitionLabel(locale), "passive", "∞");
      repetitionToastShownRef.current = true;
      return;
    }

    if (repetitionCount < 2) {
      repetitionToastShownRef.current = false;
    }
  }, [analysisMode, locale, repetitionCount, session.snapshot.status, showTransientFeedback]);

  useEffect(() => {
    if (analysisMode || session.snapshot.status !== "active") {
      fiftyMoveToastShownRef.current = fiftyMoveRulePressure.state;
      return;
    }

    if (
      (fiftyMoveRulePressure.state === "warning" || fiftyMoveRulePressure.state === "critical") &&
      fiftyMoveToastShownRef.current !== fiftyMoveRulePressure.state
    ) {
      showTransientFeedback(getFiftyMoveWarningLabel(locale, halfmoveClock), "passive", "50");
      fiftyMoveToastShownRef.current = fiftyMoveRulePressure.state;
      return;
    }

    if (fiftyMoveRulePressure.state === "normal") {
      fiftyMoveToastShownRef.current = "normal";
    }
  }, [analysisMode, fiftyMoveRulePressure.state, halfmoveClock, locale, session.snapshot.status, showTransientFeedback]);

  useEffect(() => {
    if (!analysisAutoplay || analysisCursor === null) {
      return;
    }

    if (analysisCursor >= session.moveEntries.length) {
      setAnalysisAutoplay(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      startTransition(() => {
        setAnalysisCursor(analysisCursor + 1);
      });
    }, 850);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    analysisAutoplay,
    analysisCursor,
    session.moveEntries.length,
    setAnalysisAutoplay,
    setAnalysisCursor,
  ]);

  const persistOnPause = useEffectEvent(() => {
    void persistCurrentAutosave();
  });

  const tickLoop = useEffectEvent(() => {
    tickLiveClock();
  });

  useEffect(() => {
    const interval = window.setInterval(() => tickLoop(), 250);
    const persistAutosaveSnapshot = () => {
      persistOnPause();
    };
    const visibilityChangeHandler = () => {
      if (document.visibilityState === "hidden") {
        persistAutosaveSnapshot();
      }
    };

    window.addEventListener("pagehide", persistAutosaveSnapshot);
    document.addEventListener("visibilitychange", visibilityChangeHandler);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", persistAutosaveSnapshot);
      document.removeEventListener("visibilitychange", visibilityChangeHandler);
    };
  }, []);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);
      await importPgnText(text);
      startTransition(() => {
        setHistoryOpen(true);
        setMenuOpen(false);
        setMenuView("root");
        setBottomBarExpanded(true);
      });
      setTransientToast(null);
    } catch {
      showTransientFeedback(t(locale, "save.importError"), "error", "!");
    } finally {
      event.target.value = "";
    }
  };

  const handleExportSession = async (targetSession: GameSession, label?: string) => {
    try {
      const result = await exportTextContent(
        buildPgnFilename(label),
        targetSession.snapshot.pgn,
        label ? `${label} PGN` : "Pipo Chess 3D PGN",
      );
      if (result === "cancelled") {
        return;
      }

      showTransientFeedback(t(locale, getExportToastKey(result)), "notice", "•");
    } catch {
      showTransientFeedback(t(locale, "save.exportError"), "error", "!");
    }
  };

  const openSavedAnalysis = async (targetSession: GameSession, loader: () => Promise<void>) => {
    await loader();
    startTransition(() => {
      setResultModalOpen(false);
      setMenuOpen(false);
      setMenuView("root");
      setCameraPickerOpen(false);
      setHistoryOpen(true);
      setBottomBarExpanded(true);
    });
    setAnalysisAutoplay(false);
    setAnalysisCursor(targetSession.moveEntries.length);
    if (!targetSession.analysisSummary && targetSession.moveEntries.length > 0) {
      void runAnalysis();
    }
  };

  const resumeSavedSession = async (loader: () => Promise<void>) => {
    await loader();
    startTransition(() => {
      setResultModalOpen(false);
      setMenuOpen(false);
      setMenuView("root");
      setCameraPickerOpen(false);
      setHistoryOpen(false);
      setBottomBarExpanded(true);
    });
    setAnalysisAutoplay(false);
    setAnalysisCursor(null);
  };

  const openNewGameSheet = () => {
    startTransition(() => {
      setMenuOpen(false);
      setMenuView("root");
      setCameraPickerOpen(false);
      setHistoryOpen(false);
      setNewGameColor(session.playerColor === "b" ? "black" : "white");
      syncNewGameForm(
        session.settings.clockConfig,
        session.settings.difficultyId,
        setNewGameDifficultyId,
        setSelectedClockKey,
        setCustomMinutes,
        setCustomIncrement,
      );
      setNewGameOpen(true);
      setBottomBarExpanded(true);
    });
  };

  const applyNewGame = async (forceReplace = false) => {
    if (hasReplaceableGame(useGameStore.getState().session) && !forceReplace) {
      setReplacePromptOpen(true);
      return;
    }

    const clockConfig = resolveSheetClockConfig(selectedClockKey, customMinutes, customIncrement, locale);
    await newGame({
      playerColor: newGameColor,
      difficultyId: newGameDifficultyId,
      clockConfig,
    });
    startTransition(() => {
      setNewGameOpen(false);
      setReplacePromptOpen(false);
      setResultModalOpen(false);
      setHistoryOpen(false);
      setMenuOpen(false);
      setMenuView("root");
      setAnalysisAutoplay(false);
      setAnalysisCursor(null);
    });
  };

  const enterAnalysis = async () => {
    startTransition(() => {
      setResultModalOpen(false);
      setMenuOpen(false);
      setMenuView("root");
      setCameraPickerOpen(false);
      setHistoryOpen(true);
      setBottomBarExpanded(true);
    });
    setAnalysisAutoplay(false);
    setAnalysisCursor(session.moveEntries.length);
    if (!session.analysisSummary && !analysisProgress && session.moveEntries.length > 0) {
      await runAnalysis();
    }
  };

  const primaryShellActionSpecs: ShellActionSpec[] = analysisMode
    ? [
        {
          actionId: "analysis-start",
          icon: "⏮",
          label: t(locale, "analysis.start"),
          testId: "shell-action-analysis-start",
          onClick: () => {
            setAnalysisAutoplay(false);
            setAnalysisCursor(0);
          },
        },
        {
          actionId: "analysis-previous",
          icon: "◀",
          label: t(locale, "analysis.previous"),
          testId: "shell-action-analysis-previous",
          disabled: currentPly <= 0,
          onClick: () => {
            setAnalysisAutoplay(false);
            setAnalysisCursor(currentPly - 1);
          },
        },
        {
          actionId: "analysis-play",
          icon: analysisAutoplay ? "⏸" : "▶",
          label: t(locale, analysisAutoplay ? "analysis.pause" : "analysis.play"),
          testId: "shell-action-analysis-play",
          tone: "primary",
          onClick: () => setAnalysisAutoplay(!analysisAutoplay),
        },
        {
          actionId: "analysis-next",
          icon: "▶",
          label: t(locale, "analysis.next"),
          testId: "shell-action-analysis-next",
          disabled: currentPly >= session.moveEntries.length,
          onClick: () => {
            setAnalysisAutoplay(false);
            setAnalysisCursor(currentPly + 1);
          },
        },
        {
          actionId: "analysis-end",
          icon: "⏭",
          label: t(locale, "analysis.end"),
          testId: "shell-action-analysis-end",
          onClick: () => {
            setAnalysisAutoplay(false);
            setAnalysisCursor(session.moveEntries.length);
          },
        },
        {
          actionId: "analysis-exit",
          icon: "↩",
          label: t(locale, "analysis.exit"),
          testId: "shell-action-analysis-exit",
          onClick: () => {
            setAnalysisAutoplay(false);
            setAnalysisCursor(null);
          },
        },
      ]
    : [
        {
          actionId: "new-game",
          icon: "＋",
          label: t(locale, "hud.newGame"),
          testId: "shell-action-new-game",
          tone: "primary",
          desktopCompact: false,
          desktopLabelVisibility: "always",
          onClick: openNewGameSheet,
        },
        {
          actionId: "undo",
          icon: "↺",
          label: t(locale, "hud.undo"),
          testId: "shell-action-undo",
          disabled: !session.snapshot.canUndo,
          desktopCompact: false,
          desktopLabelVisibility: "always",
          onClick: () => void undo(),
        },
        {
          actionId: "redo",
          icon: "↻",
          label: t(locale, "hud.redo"),
          testId: "shell-action-redo",
          disabled: !session.snapshot.canRedo,
          onClick: () => void redo(),
        },
        {
          actionId: "hint",
          icon: "💡",
          label: t(locale, "hud.hint"),
          testId: "shell-action-hint",
          disabled: isHintDisabled,
          loading: enginePhase === "thinking" && session.snapshot.sideToMove === session.playerColor,
          onClick: () => void requestHint(),
        },
      ];
  const utilityShellActionSpecs: ShellActionSpec[] = [
    {
      actionId: "zen",
      icon: isZenMode ? "◎" : "○",
      label: t(locale, "hud.zen"),
      testId: "shell-action-zen",
      mobileVisible: false,
      onClick: () => setIsZenMode((value) => !value),
    },
    {
      actionId: "camera",
      icon: "🎥",
      label: t(locale, "hud.camera"),
      testId: "shell-action-camera",
      onClick: toggleCameraPicker,
    },
    {
      actionId: "menu",
      icon: "☰",
      label: t(locale, "hud.menu"),
      testId: "shell-action-menu",
      onClick: toggleMenu,
    },
  ];

  const renderShellAction = (spec: ShellActionSpec, surface: "mobile" | "desktop") => {
    if (surface === "mobile" && spec.mobileVisible === false) {
      return null;
    }

    return (
      <ActionButton
        key={spec.actionId ?? spec.testId ?? spec.label}
        actionId={spec.actionId}
        disabled={spec.disabled}
        icon={spec.icon}
        label={spec.label}
        labelVisibility={
          surface === "mobile" ? bottomBarLabelVisibility : spec.desktopLabelVisibility ?? "adaptive"
        }
        loading={spec.loading}
        compact={surface === "mobile" ? true : spec.desktopCompact ?? bottomBarCompact}
        testId={spec.testId}
        tone={spec.tone}
        onClick={spec.onClick}
      />
    );
  };

  const analysisMenuSection = (
    <MenuSection
      badge={analysisSummaryCount > 0 ? String(analysisSummaryCount) : undefined}
      subtitle={analysisSectionSubtitle}
      title={t(locale, "section.analysis.title")}
      tone="analysis"
    >
      {session.moveEntries.length > 0 ? (
        <div className="inline-actions">
          <button
            className="primary-button"
            data-testid="shell-menu-analysis-open"
            type="button"
            disabled={session.moveEntries.length === 0}
            onClick={() => void enterAnalysis()}
          >
            {analysisProgress ? t(locale, "analysis.running") : t(locale, "analysis.open")}
          </button>
          <button
            className="ghost-button"
            data-testid="shell-menu-analysis-run"
            type="button"
            disabled={session.moveEntries.length === 0 || !!analysisProgress}
            onClick={() => void runAnalysis()}
          >
            {t(locale, "panel.analysis.run")}
          </button>
        </div>
      ) : null}
      <AnalysisSummaryView summary={session.analysisSummary} locale={locale} />
    </MenuSection>
  );

  const visualMenuSection = (
    <MenuSection
      subtitle={settingsSectionSubtitle}
      title={t(locale, "menu.settings")}
      tone="settings"
    >
      <div className="settings-stack">
        <div className="settings-group">
          <h3>{t(locale, "menu.quality")}</h3>
          <div className="chip-row">
            {QUALITY_PRESETS.map((option) => {
              if (option.id === "auto") {
                return (
                  <ChipButton
                    key={option.id}
                    active={qualityMode === "auto"}
                    onClick={() => {
                      void setQualityMode("auto");
                    }}
                  >
                    {t(locale, option.labelKey)}
                  </ChipButton>
                );
              }

              return (
                <ChipButton
                  key={option.id}
                  active={qualityMode === "manual" && manualQualityTier === option.tier}
                  onClick={() => {
                    void setQualityTier(option.tier);
                  }}
                >
                  {t(locale, option.labelKey)}
                </ChipButton>
              );
            })}
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "menu.coordinates")}</h3>
          <div className="chip-row">
            <ChipButton
              active={session.settings.showCoordinates}
              onClick={() => void setShowCoordinates(true)}
            >
              {t(locale, "menu.coordinates.show")}
            </ChipButton>
            <ChipButton
              active={!session.settings.showCoordinates}
              onClick={() => void setShowCoordinates(false)}
            >
              {t(locale, "menu.coordinates.hide")}
            </ChipButton>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "menu.animation")}</h3>
          <div className="chip-row">
            {(["normal", "reduced", "off"] as const).map((mode) => (
              <ChipButton
                key={mode}
                active={session.settings.animationMode === mode}
                onClick={() => void setAnimationMode(mode)}
              >
                {t(locale, `animation.${mode}`)}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "menu.feedback")}</h3>
          <div className="slider-block">
            <label>
              <span>{t(locale, "menu.sound")}</span>
              <div className="chip-row">
                <ChipButton
                  active={session.settings.soundEnabled}
                  onClick={() => void setSoundEnabled(true)}
                >
                  {t(locale, "settings.on")}
                </ChipButton>
                <ChipButton
                  active={!session.settings.soundEnabled}
                  onClick={() => void setSoundEnabled(false)}
                >
                  {t(locale, "settings.off")}
                </ChipButton>
              </div>
            </label>
            <label>
              <span>{t(locale, "menu.sound.volume")}</span>
              <strong>{Math.round(session.settings.soundVolume * 100)}%</strong>
              <input
                aria-label={t(locale, "menu.sound.volume")}
                max={1}
                min={0}
                step={0.05}
                type="range"
                value={session.settings.soundVolume}
                onChange={(event) => void setSoundVolume(Number(event.target.value))}
              />
            </label>
            <label>
              <span>{t(locale, "menu.haptics")}</span>
              <div className="chip-row">
                <ChipButton
                  active={session.settings.hapticsEnabled}
                  onClick={() => void setHapticsEnabled(true)}
                >
                  {t(locale, "settings.on")}
                </ChipButton>
                <ChipButton
                  active={!session.settings.hapticsEnabled}
                  onClick={() => void setHapticsEnabled(false)}
                >
                  {t(locale, "settings.off")}
                </ChipButton>
              </div>
            </label>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "menu.defaultView")}</h3>
          <div className="chip-row">
            {(["3d", "2d"] as const).map((mode) => (
              <ChipButton
                key={mode}
                active={session.settings.defaultViewMode === mode}
                onClick={() => void setDefaultViewMode(mode)}
              >
                {t(locale, mode === "3d" ? "view.3d" : "view.2d")}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "menu.cameraSensitivity")}</h3>
          <div className="slider-block">
            <label>
              <span>{t(locale, "menu.cameraSensitivity.rotate")}</span>
              <strong>{formatSensitivityValue(session.settings.cameraSensitivity.rotate)}</strong>
              <input
                aria-label={t(locale, "menu.cameraSensitivity.rotate")}
                max={1.75}
                min={0.5}
                step={0.25}
                type="range"
                value={session.settings.cameraSensitivity.rotate}
                onChange={(event) => {
                  void setCameraSensitivity({
                    ...session.settings.cameraSensitivity,
                    rotate: Number(event.target.value),
                  });
                }}
              />
            </label>
            <label>
              <span>{t(locale, "menu.cameraSensitivity.zoom")}</span>
              <strong>{formatSensitivityValue(session.settings.cameraSensitivity.zoom)}</strong>
              <input
                aria-label={t(locale, "menu.cameraSensitivity.zoom")}
                max={1.75}
                min={0.5}
                step={0.25}
                type="range"
                value={session.settings.cameraSensitivity.zoom}
                onChange={(event) => {
                  void setCameraSensitivity({
                    ...session.settings.cameraSensitivity,
                    zoom: Number(event.target.value),
                  });
                }}
              />
            </label>
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "panel.themes.title")}</h3>
          <div className="theme-grid">
            {themes.map((option) => (
              <button
                className={`theme-card ${session.settings.themeId === option.id ? "is-selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => void setTheme(option.id)}
              >
                <strong>{option.label}</strong>
                <span className="theme-swatch-row">
                  <i style={{ background: option.boardLight }} />
                  <i style={{ background: option.boardDark }} />
                  <i style={{ background: option.highlightPrimary }} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-group">
          <h3>{t(locale, "panel.language.title")}</h3>
          <div className="chip-row">
            {locales.map((option) => (
              <ChipButton
                key={option}
                active={session.settings.locale === option}
                onClick={() => void setLocale(option)}
              >
                {getLocaleLabel(option)}
              </ChipButton>
            ))}
          </div>
        </div>

        <div className="inline-actions">
          <button className="ghost-button" type="button" onClick={() => void toggleOrientation()}>
            {t(locale, "hud.flip")}
          </button>
        </div>
      </div>
    </MenuSection>
  );

  const libraryMenuSection = (
    <MenuSection
      badge={saveSlots.length > 0 ? String(saveSlots.length) : undefined}
      subtitle={librarySectionSubtitle}
      title={t(locale, "section.library.title")}
      tone="library"
    >
      {autosave ? (
        <article className="save-row save-row--autosave">
          <span className="save-row__icon" aria-hidden="true">
            ↺
          </span>
          <div className="save-row__copy">
            <span className="save-row__eyebrow">{t(locale, "section.library.title")}</span>
            <strong>{t(locale, "panel.saveLoad.autosave")}</strong>
            <span>{autosaveTimestamp}</span>
            <small>{buildSaveSummary(autosave.session, autosave.updatedAt, locale)}</small>
          </div>
          <div className="save-row__actions">
            {canResumeSession(autosave.session) ? (
              <button
                className="ghost-button save-action-button"
                data-icon="▶"
                type="button"
                onClick={() => void resumeSavedSession(restoreAutosave)}
              >
                {t(locale, "save.restore")}
              </button>
            ) : null}
            {canAnalyzeSession(autosave.session) ? (
              <button
                className="ghost-button save-action-button"
                data-icon="∿"
                type="button"
                onClick={() => void openSavedAnalysis(autosave.session, restoreAutosave)}
              >
                {t(locale, "analysis.open")}
              </button>
            ) : null}
            <button
              className="ghost-button save-action-button"
              data-icon="↗"
              type="button"
              onClick={() => void handleExportSession(autosave.session, "autosave")}
            >
              {t(locale, "hud.export")}
            </button>
          </div>
        </article>
      ) : null}

      <div className="inline-actions inline-actions--library">
        <button
          className="primary-button library-action-button"
          data-icon="+"
          type="button"
          onClick={() => void createManualSave()}
        >
          {t(locale, "panel.saveLoad.create")}
        </button>
        <button
          className="ghost-button library-action-button"
          data-icon="↧"
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          {t(locale, "hud.import")}
        </button>
        <button
          className="ghost-button library-action-button"
          data-icon="↗"
          type="button"
          onClick={() => void handleExportSession(session)}
        >
          {t(locale, "hud.export")}
        </button>
      </div>

      <div className="save-list">
        {saveSlots.map((save) => (
          <article className="save-row" key={save.id}>
            <span className="save-row__icon" aria-hidden="true">
              ◫
            </span>
            <div className="save-row__copy">
              <strong>{save.label}</strong>
              <span>{formatRelativeTimestamp(save.updatedAt, locale)}</span>
              <small>{buildSaveSummary(save.session, save.updatedAt, locale)}</small>
            </div>
            <div className="save-row__actions">
              {canResumeSession(save.session) ? (
                <button
                  className="ghost-button save-action-button"
                  data-icon="▶"
                  type="button"
                  onClick={() => void resumeSavedSession(() => loadManualSave(save.id!))}
                >
                  {t(locale, "save.continue")}
                </button>
              ) : null}
              {canAnalyzeSession(save.session) ? (
                <button
                  className="ghost-button save-action-button"
                  data-icon="∿"
                  type="button"
                  onClick={() => void openSavedAnalysis(save.session, () => loadManualSave(save.id!))}
                >
                  {t(locale, "analysis.open")}
                </button>
              ) : null}
              <button
                className="ghost-button save-action-button"
                data-icon="↗"
                type="button"
                onClick={() => void handleExportSession(save.session, save.label)}
              >
                {t(locale, "hud.export")}
              </button>
              <button
                className="ghost-button save-action-button"
                data-icon="×"
                type="button"
                onClick={() => void deleteManualSave(save.id!)}
              >
                {t(locale, "panel.saveLoad.delete")}
              </button>
            </div>
          </article>
        ))}
        {saveSlots.length === 0 ? <p className="muted-copy">{t(locale, "panel.saveLoad.empty")}</p> : null}
      </div>
    </MenuSection>
  );

  const mobileMenuRoot = (
    <div className="menu-root-view" data-testid="menu-root-view">
      <MenuSection
        subtitle={historySessionSubtitle}
        title={t(locale, "hud.primaryActions")}
        tone="settings"
      >
        <div className="menu-root-summary">
          <div className="menu-root-summary__meta">
            <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
            <span className="panel-header__badge">{analysisMode ? t(locale, "history.analysis") : activeDifficulty.label}</span>
          </div>
          <strong className="menu-root-summary__heading">
            {analysisMode ? t(locale, "history.analysis") : activeDifficulty.label}
          </strong>
          <p className="menu-root-summary__copy">{historySummary}</p>
        </div>
        <div className="inline-actions inline-actions--root">
          {analysisMode ? (
            <button
              className="ghost-button"
              data-testid="shell-menu-root-exit-analysis"
              type="button"
              onClick={() => {
                setAnalysisAutoplay(false);
                setAnalysisCursor(null);
                closeMenu();
              }}
            >
              {t(locale, "analysis.exit")}
            </button>
          ) : session.moveEntries.length > 0 ? (
            <button
              className="primary-button"
              data-testid="shell-menu-root-open-analysis"
              type="button"
              onClick={() => void enterAnalysis()}
            >
              {analysisProgress ? t(locale, "analysis.running") : t(locale, "analysis.open")}
            </button>
          ) : null}
          <button
            className="ghost-button"
            data-testid="shell-menu-root-flip"
            type="button"
            onClick={() => {
              void toggleOrientation();
              closeMenu();
            }}
          >
            {t(locale, "hud.flip")}
          </button>
          <button
            className="ghost-button"
            data-testid="shell-menu-root-zen"
            type="button"
            onClick={() => {
              setIsZenMode((value) => !value);
              closeMenu();
            }}
          >
            {t(locale, "hud.zen")}
          </button>
        </div>
      </MenuSection>

      <div className="menu-nav-grid" data-testid="shell-menu-root-nav">
        <button
          className="menu-nav-card menu-nav-card--analysis"
          data-testid="shell-menu-nav-analysis"
          type="button"
          onClick={() => setMenuView("analysis")}
        >
          <span className="menu-nav-card__eyebrow">{t(locale, "section.analysis.title")}</span>
          <strong>{session.moveEntries.length > 0 ? t(locale, "analysis.open") : t(locale, "panel.analysis.run")}</strong>
          <small>{analysisSectionSubtitle}</small>
          {analysisSummaryCount > 0 ? <span className="menu-nav-card__badge">{analysisSummaryCount}</span> : null}
        </button>

        <button
          className="menu-nav-card menu-nav-card--visual"
          data-testid="shell-menu-nav-visual"
          type="button"
          onClick={() => setMenuView("visual")}
        >
          <span className="menu-nav-card__eyebrow">{t(locale, "menu.settings")}</span>
          <strong>{theme.label}</strong>
          <small>{settingsSectionSubtitle}</small>
        </button>

        <button
          className="menu-nav-card menu-nav-card--library"
          data-testid="shell-menu-nav-library"
          type="button"
          onClick={() => setMenuView("library")}
        >
          <span className="menu-nav-card__eyebrow">{t(locale, "section.library.title")}</span>
          <strong>{saveSlots.length > 0 ? String(saveSlots.length) : t(locale, "panel.saveLoad.create")}</strong>
          <small>{librarySectionSubtitle}</small>
          {saveSlots.length > 0 ? <span className="menu-nav-card__badge">{saveSlots.length}</span> : null}
        </button>
      </div>
    </div>
  );

  const menuDrawerMotion = getDrawerMotionProps(
    motionMode,
    isMobileShell ? "mobile-sheet" : "desktop-side",
  );

  const topSide = buildClockSide(topColor, session, locale);
  const bottomSide = buildClockSide(bottomColor, session, locale);

  return (
    <div
      className={`app-shell${analysisMode ? " is-analysis" : ""}${isZenMode ? " is-zen" : ""}`}
      data-motion-mode={motionMode}
      data-shell-mode={shellMode}
      data-shell-zen={isZenMode ? "true" : "false"}
      ref={appShellRef}
      style={style}
    >
      <div className="canvas-backdrop" />
      <div className="backdrop-orb backdrop-orb--primary" />
      <div className="backdrop-orb backdrop-orb--secondary" />

      <HistoryPanel
        open={historyOpen}
        hidden={isZenMode}
        presentation={isMobileShell ? "mobile-sheet" : "desktop-side"}
        engineLabel={analysisMode ? t(locale, "history.analysis") : activeDifficulty.label}
        historyBadgeLabel={analysisMode ? t(locale, "history.analysis") : t(locale, "history.pgn")}
        historyProgress={historyProgress}
        historySessionSubtitle={historySessionSubtitle}
        historySummary={historySummary}
        locale={locale}
        moveCount={session.moveEntries.length}
        moves={deferredMoves}
        selectedPly={analysisMode ? currentPly : null}
        sessionStatusLabel={analysisMode ? t(locale, "history.analysis") : t(locale, getStatusKey(enginePhase))}
        sessionStatusTone={analysisMode ? "analyzing" : enginePhase}
        tagsByPly={session.analysisSummary?.tagsByPly}
        onToggle={toggleHistory}
        onSelectPly={(ply) => {
          setAnalysisAutoplay(false);
          setAnalysisCursor(ply);
        }}
        rootTestId="history-panel"
        toggleTestId="history-trigger"
        panelTestId="history-panel-shell"
        shellPointerEvents={menuOpen ? "none" : "auto"}
      />

      <main className="stage-root">
        <div className="stage-playfield">
          <Suspense fallback={null}>
            <ChessScene
              session={boardSession}
              theme={theme}
              interactionEnabled={!analysisMode}
              lastMove={boardLastMove}
              promotionAnchorSquare={pendingPromotion?.anchorSquare ?? null}
              selectedSquare={analysisMode ? null : selectedSquare}
              legalTargets={analysisMode ? [] : legalTargets}
              hintMove={analysisMode ? null : hintMove}
              invalidMoveSquare={invalidMoveSquare}
              checkSquare={invalidMoveSquare ? null : checkedKingSquare}
              castlingTargets={analysisMode ? [] : castlingTargets}
              onLoadStateChange={setSceneLoadState}
              onSquareSelect={(square) => void handleBoardInteraction(square)}
              onPromotionAnchorChange={setPromotionAnchor}
              onInvalidMoveAnchorChange={setInvalidMoveAnchor}
              onCheckAnchorChange={setCheckAnchor}
              onCastlingAnchorChange={setCastlingAnchor}
            />
          </Suspense>
        </div>
        {analysisMode ? (
          <EvalBar evaluation={currentEvaluation} locale={locale} />
        ) : null}
      </main>

      <AnimatePresence>
        {isZenMode && (
          <motion.button
            className="zen-exit"
            key="zen-exit"
            type="button"
            aria-label={t(locale, "hud.exitZen")}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={() => setIsZenMode(false)}
          >
            ◎
          </motion.button>
        )}
      </AnimatePresence>

      <motion.section
        className={`top-bar ${topBarExpanded ? "is-expanded" : ""}`}
        data-shell-surface="top-bar"
        data-shell-mode={shellMode}
        data-testid="shell-top-bar"
        animate={{
          opacity: isZenMode ? 0 : 1,
          height: isZenMode ? 0 : "auto",
          marginBlock: isZenMode ? 0 : undefined,
          paddingBlock: isZenMode ? 0 : undefined,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ overflow: "hidden", pointerEvents: isZenMode ? "none" : undefined }}
      >
        <div className="top-bar__nav">
          <div className="top-bar__island top-bar__island--brand">
            <div className="top-bar__brand">
              <span className="top-bar__brand-mark" aria-hidden="true">
                ◧
              </span>
              <div className="top-bar__brand-copy">
                <strong>Pipo Chess 3D</strong>
                {!isMobileShell ? (
                  <small>{analysisMode ? t(locale, "history.analysis") : t(locale, "hud.localAi")}</small>
                ) : null}
              </div>
            </div>
          </div>
          <div className="top-bar__island top-bar__island--timers">
            <div className="top-bar__timers">
              <ClockPill side={topSide} collapsed={topBarCollapsed} />
              <ClockPill side={bottomSide} collapsed={topBarCollapsed} />
            </div>
          </div>
          <div className="top-bar__island top-bar__island--engine">
            <div className="top-bar__engine">
              <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
              {showOfflineReadyPill ? (
                <span className="status-pill status-pill--offline">{t(locale, "hud.offline")}</span>
              ) : null}
              <div className="top-bar__engine-copy">
                <strong>{activeDifficulty.label}</strong>
                {!isMobileShell ? <small>{engineMessage || t(locale, getStatusKey(enginePhase))}</small> : null}
              </div>
            </div>
            {!isMobileShell ? (
              <button
                className="bar-toggle top-bar__toggle"
                data-testid="shell-top-toggle"
                type="button"
                aria-label={t(locale, topBarExpanded ? "panel.close" : "hud.expandStatus")}
                onClick={() => {
                  startTransition(() => {
                    setTopBarExpanded((value) => !value);
                  });
                }}
              >
                {topBarExpanded ? "−" : "+"}
              </button>
            ) : null}
          </div>
        </div>
      </motion.section>

      <motion.section
        className={`bottom-bar ${bottomBarExpanded ? "is-expanded" : ""}`}
        data-shell-surface="bottom-bar"
        data-shell-mode={shellMode}
        data-testid="shell-bottom-bar"
        animate={{
          opacity: isZenMode ? 0 : 1,
          height: isZenMode ? 0 : "auto",
          marginBlock: isZenMode ? 0 : undefined,
          paddingBlock: isZenMode ? 0 : undefined,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ overflow: isZenMode ? "hidden" : "visible", pointerEvents: isZenMode ? "none" : undefined }}
      >
        {isMobileShell ? (
          <div
            className="bottom-bar__cluster bottom-bar__cluster--primary"
            data-shell-dock="mobile"
            data-shell-layout="icon-only"
            data-testid="shell-mobile-dock"
          >
            {[...primaryShellActionSpecs, ...utilityShellActionSpecs].map((spec) =>
              renderShellAction(spec, "mobile"),
            )}
          </div>
        ) : (
          <>
            <div className="bottom-bar__cluster bottom-bar__cluster--primary" data-shell-dock="desktop-primary">
              {primaryShellActionSpecs.map((spec) => renderShellAction(spec, "desktop"))}
            </div>
            <div className="bottom-bar__cluster bottom-bar__cluster--utility" data-shell-dock="desktop-utility">
              {utilityShellActionSpecs.map((spec) => renderShellAction(spec, "desktop"))}
              <button
                className="bar-toggle bottom-bar__toggle"
                data-testid="shell-bottom-toggle"
                type="button"
                aria-label={t(locale, bottomBarExpanded ? "panel.close" : "hud.expandActions")}
                onClick={() => {
                  startTransition(() => {
                    setBottomBarExpanded((value) => !value);
                  });
                }}
              >
                {bottomBarExpanded ? "−" : "+"}
              </button>
            </div>
          </>
        )}
      </motion.section>

      <AnimatePresence>
        {cameraPickerOpen && (
          <BaseOverlay
            motionMode={motionMode}
            blockInteraction
            dismissibleBackdrop
            onClose={closeCameraPicker}
            showScrim={false}
            testId="camera-overlay"
          >
            <CameraPickerPanel
              cameraPreset={cameraPreset}
              presentation={cameraPresentation}
              presets={CAMERA_PRESETS.map((preset) => ({
                id: preset.id,
                icon: preset.icon,
                label: t(locale, preset.labelKey),
              }))}
              title={t(locale, "hud.camera")}
              kicker={t(locale, "camera.kicker")}
              rootTestId="camera-panel"
              gridTestId="camera-panel-grid"
              onSelectPreset={(preset) => {
                setCameraPreset(preset);
                closeCameraPicker();
              }}
            />
          </BaseOverlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <BaseOverlay motionMode={motionMode} onClose={closeMenu} testId="shell-menu-overlay">
            <motion.aside
              className="menu-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={t(locale, "hud.menu")}
              data-menu-layout={isMobileShell ? "mobile" : "desktop"}
              data-menu-view={menuView}
              data-shell-mode={shellMode}
              data-testid="shell-menu"
              initial={menuDrawerMotion.initial}
              animate={menuDrawerMotion.animate}
              exit={menuDrawerMotion.exit}
              transition={menuDrawerMotion.transition}
              style={{ pointerEvents: "auto" }}
            >
              <div className="menu-drawer__shell">
                <div className="panel-header menu-drawer__header">
                  <div className="panel-header__cluster">
                    {!isMobileShell || menuView === "root" ? (
                      <span className="panel-header__glyph" aria-hidden="true">
                        ☰
                      </span>
                    ) : (
                      <button
                        className="ghost-icon-button"
                        data-testid="shell-menu-back"
                        type="button"
                        aria-label={t(locale, "analysis.exit")}
                        onClick={() => setMenuView("root")}
                      >
                        ←
                      </button>
                    )}
                    <div>
                      <p className="panel-kicker">{t(locale, "menu.kicker")}</p>
                      <h2>
                        {menuView === "analysis"
                          ? t(locale, "section.analysis.title")
                          : menuView === "visual"
                            ? t(locale, "menu.settings")
                            : menuView === "library"
                              ? t(locale, "section.library.title")
                              : t(locale, "hud.menu")}
                      </h2>
                      <p className="menu-drawer__subtitle">
                        {menuView === "analysis"
                          ? analysisSectionSubtitle
                          : menuView === "visual"
                            ? settingsSectionSubtitle
                            : menuView === "library"
                              ? librarySectionSubtitle
                              : historySessionSubtitle}
                      </p>
                    </div>
                  </div>
                  <div className="panel-header__meta">
                    <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
                    <button
                      className="ghost-icon-button"
                      data-testid="shell-menu-close"
                      type="button"
                      aria-label={t(locale, "panel.close")}
                      onClick={closeMenu}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div
                  className="menu-drawer__scroll"
                  data-menu-layout={isMobileShell ? "mobile" : "desktop"}
                  data-menu-view={menuView}
                  data-testid={`shell-menu-view-${menuView}`}
                >
                  {isMobileShell
                    ? menuView === "analysis"
                      ? analysisMenuSection
                      : menuView === "visual"
                        ? visualMenuSection
                        : menuView === "library"
                          ? libraryMenuSection
                          : mobileMenuRoot
                    : (
                        <>
                          {analysisMenuSection}
                          {visualMenuSection}
                          {libraryMenuSection}
                        </>
                      )}
                </div>
              </div>
            </motion.aside>
          </BaseOverlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newGameOpen && (
          <BaseOverlay motionMode={motionMode} onClose={() => setNewGameOpen(false)} testId="new-game-overlay">
            <PresenceAwareNewGameSheet
              key="new-game-sheet"
              ariaLabel={t(locale, "panel.newGame.title")}
              motionMode={motionMode}
              presentation={newGamePresentation}
            >
              <div className="panel-header panel-header--sheet">
                <div className="panel-header__cluster">
                  <span className="panel-header__glyph" aria-hidden="true">
                    ✦
                  </span>
                  <div>
                    <p className="panel-kicker">{t(locale, "newGame.kicker")}</p>
                    <h2>{t(locale, "panel.newGame.title")}</h2>
                  </div>
                </div>
                <div className="panel-header__meta">
                  <button
                    className="ghost-icon-button"
                    type="button"
                    aria-label={t(locale, "panel.close")}
                    onClick={() => setNewGameOpen(false)}
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="new-game-sheet__content">
                <div className="settings-group">
                  <h3>{t(locale, "newGame.color")}</h3>
                  <div className="chip-row chip-row--three">
                    {(["white", "random", "black"] as const).map((colorChoice) => (
                      <ChipButton
                        key={colorChoice}
                        active={newGameColor === colorChoice}
                        onClick={() => setNewGameColor(colorChoice)}
                      >
                        {t(locale, `newGame.color.${colorChoice}`)}
                      </ChipButton>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <h3>{t(locale, "newGame.level")}</h3>
                  <div className="slider-block slider-block--difficulty">
                    <div className="difficulty-scale__header">
                      <strong className="difficulty-scale__title">{selectedNewGameDifficulty.label}</strong>
                      <div className="difficulty-scale__legend">
                        <span className="difficulty-scale__legend-label">{t(locale, "newGame.elo")}</span>
                        <span className="difficulty-scale__tooltip">
                          <button
                            className="difficulty-scale__tooltip-trigger"
                            type="button"
                            aria-label={t(locale, "newGame.eloHelpLabel")}
                            aria-describedby="difficulty-elo-tooltip"
                          >
                            ?
                          </button>
                          <span className="difficulty-scale__tooltip-bubble" id="difficulty-elo-tooltip" role="tooltip">
                            {t(locale, "newGame.eloHelp")}
                          </span>
                        </span>
                      </div>
                    </div>
                    <input
                      aria-label={t(locale, "newGame.level")}
                      aria-valuetext={formatDifficultyAriaValue(selectedNewGameDifficulty)}
                      max={difficultyPresets.length - 1}
                      min={0}
                      type="range"
                      value={selectedDifficultyIndex}
                      onChange={(event) => {
                        const index = Number(event.target.value);
                        setNewGameDifficultyId(difficultyPresets[index]?.id ?? difficultyPresets[0].id);
                      }}
                    />
                    <div className="difficulty-scale__footer">
                      <div className="difficulty-scale__ticks" aria-hidden="true">
                        {difficultyPresets.map((preset, index) => (
                          <span
                            key={preset.id}
                            className={preset.id === newGameDifficultyId ? "is-active" : undefined}
                            style={getDifficultyStopStyle(index, difficultyPresets.length)}
                          />
                        ))}
                      </div>
                      <div className="slider-labels slider-labels--difficulty" aria-hidden="true">
                        {difficultyPresets.map((preset, index) => (
                          <span
                            key={preset.id}
                            className={preset.id === newGameDifficultyId ? "is-active" : undefined}
                            style={getDifficultyStopStyle(index, difficultyPresets.length)}
                          >
                            {formatDifficultyTickLabel(preset)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-group">
                  <h3>{t(locale, "panel.clock.title")}</h3>
                  <div className="chip-row chip-row--clock" style={clockChoiceGridStyle}>
                    {NEW_GAME_CLOCK_PRESETS.map((preset) => (
                      <ChipButton
                        key={getClockKey(preset)}
                        active={selectedClockKey === getClockKey(preset)}
                        onClick={() => setSelectedClockKey(getClockKey(preset))}
                      >
                        {formatClockChoiceLabel(preset, locale)}
                      </ChipButton>
                    ))}
                    <ChipButton active={selectedClockKey === "custom"} onClick={() => setSelectedClockKey("custom")}>
                      {t(locale, "panel.clock.custom")}
                    </ChipButton>
                  </div>
                  {selectedClockKey === "custom" ? (
                    <div className="custom-clock">
                      <label>
                        {t(locale, "panel.clock.minutes")}
                        <input value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} />
                      </label>
                      <label>
                        {t(locale, "panel.clock.increment")}
                        <input value={customIncrement} onChange={(event) => setCustomIncrement(event.target.value)} />
                      </label>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="new-game-sheet__footer">
                <button className="primary-button primary-button--full" type="button" onClick={() => void applyNewGame()}>
                  {t(locale, "panel.newGame.confirm")}
                </button>
              </div>
            </PresenceAwareNewGameSheet>
          </BaseOverlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingPromotion && (
          <BaseOverlay motionMode={motionMode} onClose={() => {}} showScrim={false} blockInteraction>
            <motion.section
              className="promotion-popup"
              role="dialog"
              aria-busy={promotionSelection ? "true" : undefined}
              aria-label={t(locale, "promotion.title")}
              data-promotion-state={promotionSelection ? "resolving" : "ready"}
              style={getPromotionPopupStyle(promotionAnchor)}
              initial={getPromotionPopupMotionProps(motionMode).initial}
              animate={getPromotionPopupMotionProps(motionMode).animate}
              exit={getPromotionPopupMotionProps(motionMode).exit}
              transition={getPromotionPopupMotionProps(motionMode).transition}
            >
              <p className="panel-kicker promotion-popup__kicker">{t(locale, "promotion.title")}</p>
              <div className="promotion-options">
                {PROMOTION_CHOICES.map((piece) => (
                  <button
                    className={`promotion-option${promotionSelection === piece ? " is-selected" : ""}`}
                    key={piece}
                    type="button"
                    disabled={promotionSelection !== null}
                    onClick={() => {
                      setPromotionSelection(piece);
                      void confirmPromotion(piece);
                    }}
                  >
                    <span className="promotion-option__well" aria-hidden="true">
                      <span className="promotion-option__glyph">{getPromotionGlyph(piece, session.playerColor)}</span>
                    </span>
                    <small className="promotion-option__label">{t(locale, getPromotionKey(piece))}</small>
                  </button>
                ))}
              </div>
            </motion.section>
          </BaseOverlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {checkAnchor ? (
          <BaseOverlay motionMode={motionMode} onClose={() => {}} showScrim={false} blockInteraction={false}>
            <motion.div
              className={`board-cue board-cue--${checkCueTone}`}
              data-testid="check-cue"
              key="check-cue"
              style={getBoardCueStyle(checkAnchor)}
              initial={getCueMotionProps(motionMode).initial}
              animate={getCueMotionProps(motionMode).animate}
              exit={getCueMotionProps(motionMode).exit}
              transition={getCueMotionProps(motionMode).transition}
            >
              <span className="board-cue__summary">
                <span className="board-cue__glyph" aria-hidden="true">{checkCueTone === "checkmate" ? "#" : "+"}</span>
                <span className="board-cue__summary-text">{checkCueLabel}</span>
              </span>
            </motion.div>
          </BaseOverlay>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {invalidMoveSquare && invalidMoveAnchor ? (
          <BaseOverlay
            motionMode={motionMode}
            onClose={clearDecisionCue}
            showScrim={false}
            blockInteraction={false}
          >
            <motion.div
              className={`board-cue board-cue--${invalidMoveTone}${invalidMoveExpanded ? " board-cue--expanded" : ""}`}
              key="invalid-move-cue"
              style={{
                ...getBoardCueStyle(invalidMoveAnchor),
                ...(invalidMoveDetail ? { cursor: "pointer", pointerEvents: "auto" as const } : {}),
              }}
              initial={getCueMotionProps(motionMode).initial}
              animate={getCueMotionProps(motionMode).animate}
              exit={getCueMotionProps(motionMode).exit}
              transition={getCueMotionProps(motionMode).transition}
              onClick={invalidMoveDetail ? () => setInvalidMoveExpanded((v) => !v) : undefined}
            >
              <span className="board-cue__summary">
                <span className="board-cue__glyph" aria-hidden="true">{invalidMoveIcon}</span>
                <span className="board-cue__summary-text">
                  {invalidMoveSummary ?? t(locale, "feedback.invalidMove")}
                </span>
                {invalidMoveDetail ? (
                  <span className="board-cue__expand-indicator">{invalidMoveExpanded ? "−" : "+"}</span>
                ) : null}
              </span>
              <AnimatePresence>
                {invalidMoveExpanded && invalidMoveDetail ? (
                  <motion.span
                    className="board-cue__detail"
                    key="detail"
                    initial={getCueDetailMotionProps(motionMode).initial}
                    animate={getCueDetailMotionProps(motionMode).animate}
                    exit={getCueDetailMotionProps(motionMode).exit}
                    transition={getCueDetailMotionProps(motionMode).transition}
                  >
                    {invalidMoveDetail}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </motion.div>
          </BaseOverlay>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {castlingTargets.length > 0 && castlingAnchor ? (
          <BaseOverlay motionMode={motionMode} onClose={() => {}} showScrim={false} blockInteraction={false}>
            <motion.div
              className="board-cue board-cue--castling"
              key="castling-cue"
              style={getBoardCueStyle(castlingAnchor)}
              initial={getCueMotionProps(motionMode).initial}
              animate={getCueMotionProps(motionMode).animate}
              exit={getCueMotionProps(motionMode).exit}
              transition={getCueMotionProps(motionMode).transition}
            >
              <span className="board-cue__summary">
                <span className="board-cue__glyph" aria-hidden="true">♜</span>
                <span className="board-cue__summary-text">{t(locale, "feedback.castling")}</span>
              </span>
            </motion.div>
          </BaseOverlay>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {replacePromptOpen ? (
          <ReplaceGameDialog
            motionMode={motionMode}
            open={replacePromptOpen}
            badge={t(locale, "panel.newGame.title")}
            title={t(locale, "confirm.newGame.title")}
            body={t(locale, "confirm.newGame.body")}
            keepLabel={t(locale, "confirm.newGame.keep")}
            cancelLabel={t(locale, "confirm.newGame.cancel")}
            replaceLabel={t(locale, "confirm.newGame.replace")}
            onKeep={() => setReplacePromptOpen(false)}
            onCancel={() => {
              setReplacePromptOpen(false);
              setNewGameOpen(false);
            }}
            onReplace={() => void applyNewGame(true)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {resultModalOpen ? (
          <ResultModalOverlay
            motionMode={motionMode}
            open={resultModalOpen}
            kicker={t(locale, "result.kicker")}
            glyph={getResultGlyph(session)}
            tone={session.snapshot.status === "checkmate" ? "checkmate" : "default"}
            title={t(locale, getFriendlyResultKey(session))}
            subtitle={t(locale, getResultStatusKey(session.snapshot.status))}
            metrics={[
              { label: t(locale, "hud.moves"), value: session.moveEntries.length },
              { label: t(locale, "newGame.level"), value: getDifficultyPreset(session.settings.difficultyId).label },
              { label: t(locale, "panel.clock.title"), value: session.settings.clockConfig.label },
            ]}
            analysisLabel={t(locale, "analysis.open")}
            newGameLabel={t(locale, "hud.newGame")}
            menuLabel={t(locale, "hud.menu")}
            onOpenAnalysis={() => void enterAnalysis()}
            onOpenNewGame={openNewGameSheet}
            onOpenMenu={() => {
              setResultModalOpen(false);
              setMenuOpen(true);
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeToast ? (
          <motion.div
            aria-live={activeToast.tone === "error" || activeToast.tone === "checkmate" ? "assertive" : "polite"}
            className={`toast is-${activeToast.tone}`}
            key="toast"
            role={activeToast.tone === "error" || activeToast.tone === "checkmate" ? "alert" : "status"}
            initial={getToastMotionProps(motionMode).initial}
            animate={getToastMotionProps(motionMode).animate}
            exit={getToastMotionProps(motionMode).exit}
            transition={getToastMotionProps(motionMode).transition}
          >
            <span className="toast__icon" aria-hidden="true">
              {activeToast.icon}
            </span>
            <div className="toast__body">
              <span className="toast__message">{activeToast.message}</span>
              {activeToast.actionLabel && activeToast.onAction ? (
                <button className="ghost-button toast__action" type="button" onClick={activeToast.onAction}>
                  {activeToast.actionLabel}
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showBootScrim && (
          <motion.div
            className="boot-scrim"
            key="boot-scrim"
            exit={getBootScrimExitProps(motionMode)}
            transition={getBootScrimTransition(motionMode)}
          >
            <div className="boot-scrim__content">
              <span className="boot-scrim__icon" aria-hidden="true">
                ♜
              </span>
              <div className="boot-scrim__copy">
                <strong className="boot-scrim__title">Pipo Chess 3D</strong>
                <span className="boot-scrim__subtitle">{t(locale, "status.loading")}</span>
              </div>
              <div className="boot-scrim__track" aria-hidden="true">
                <span className="boot-scrim__fill" style={{ width: `${bootProgress}%` }} />
              </div>
              <small className="boot-scrim__meta">{bootMeta}</small>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        hidden
        ref={fileInputRef}
        accept=".pgn"
        type="file"
        onChange={(event) => {
          void handleImport(event);
        }}
      />
    </div>
  );
}

function EvalBar({
  evaluation,
  locale,
  elementRef,
}: {
  evaluation: PositionEvaluation | null;
  locale: GameSession["settings"]["locale"];
  elementRef?: Ref<HTMLElement>;
}) {
  const score = normalizeEvaluationScore(evaluation);
  const percentage = clamp(50 + score / 18, 6, 94);
  const label = formatEvaluationLabel(evaluation, locale);

  return (
    <aside className="eval-bar" ref={elementRef} aria-label={t(locale, "analysis.eval")}>
      <div className="eval-bar__track">
        <motion.div
          className="eval-bar__fill"
          animate={{ height: `${percentage}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>
      <strong className="eval-bar__label">{label}</strong>
    </aside>
  );
}

function buildClockSide(color: Color, session: GameSession, locale: GameSession["settings"]["locale"]): ClockSideState {
  const isPlayer = color === session.playerColor;
  const time = color === "w" ? session.snapshot.clockState.whiteMs : session.snapshot.clockState.blackMs;

  return {
    label: isPlayer ? t(locale, "hud.you") : t(locale, "hud.localAi"),
    subtitle: isPlayer ? t(locale, "hud.player") : `${t(locale, "hud.engine")} · ${getDifficultyPreset(session.settings.difficultyId).label}`,
    time,
    active: session.snapshot.clockState.activeColor === color,
    thinking:
      !isPlayer &&
      session.snapshot.clockState.activeColor === color &&
      session.snapshot.status === "active",
    lowTime:
      !session.settings.clockConfig.enabled || session.snapshot.status === "timeout"
        ? "off"
        : time <= LOW_TIME_CRITICAL_MS
          ? "critical"
          : time <= LOW_TIME_WARNING_MS
            ? "warning"
            : "off",
  };
}

function resolveOverlayMotionMode(
  animationMode: GameSession["settings"]["animationMode"],
  systemPrefersReducedMotion: boolean,
): OverlayMotionMode {
  if (animationMode === "off") {
    return "off";
  }

  if (animationMode === "reduced" || systemPrefersReducedMotion) {
    return "reduced";
  }

  return "normal";
}

function getBackdropMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1 },
      animate: { opacity: 1 },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: motionMode === "reduced" ? 0.12 : 0.2 },
  };
}

function getSheetMotionProps(
  motionMode: OverlayMotionMode,
  presentation: "desktop-modal" | "mobile-sheet",
) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, scale: 1, x: 0, y: 0 },
      animate: { opacity: 1, scale: 1, x: 0, y: 0 },
      exit: { opacity: 1, scale: 1, x: 0, y: 0 },
      transition: { duration: 0 },
    };
  }

  if (presentation === "mobile-sheet") {
    return motionMode === "reduced"
      ? {
          initial: { y: "4%", opacity: 0 },
          animate: { y: 0, opacity: 1 },
          exit: { y: "4%", opacity: 0 },
          transition: { duration: 0.16, ease: "easeOut" as const },
        }
      : {
          initial: { y: "110%", opacity: 0 },
          animate: { y: 0, opacity: 1 },
          exit: { y: "110%", opacity: 0 },
          transition: { type: "spring" as const, stiffness: 320, damping: 36 },
        };
  }

  return motionMode === "reduced"
    ? {
        initial: { opacity: 0, scale: 0.98 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.99 },
        transition: { duration: 0.14, ease: "easeOut" as const },
      }
    : {
        initial: { scale: 0.92, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.95, opacity: 0 },
        transition: { type: "spring" as const, stiffness: 300, damping: 34 },
      };
}

function getDrawerMotionProps(
  motionMode: OverlayMotionMode,
  presentation: "desktop-side" | "mobile-sheet",
) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, x: 0, y: 0 },
      animate: { opacity: 1, x: 0, y: 0 },
      exit: { opacity: 1, x: 0, y: 0 },
      transition: { duration: 0 },
    };
  }

  if (presentation === "mobile-sheet") {
    return motionMode === "reduced"
      ? {
          initial: { y: "6%", opacity: 0 },
          animate: { y: 0, opacity: 1 },
          exit: { y: "6%", opacity: 0 },
          transition: { duration: 0.16, ease: "easeOut" as const },
        }
      : {
          initial: { y: "110%", opacity: 0 },
          animate: { y: 0, opacity: 1 },
          exit: { y: "110%", opacity: 0 },
          transition: { type: "spring" as const, stiffness: 320, damping: 36 },
        };
  }

  return motionMode === "reduced"
    ? {
        initial: { x: "4%", opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "4%", opacity: 0 },
        transition: { duration: 0.16, ease: "easeOut" as const },
      }
    : {
        initial: { x: "110%", opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: "110%", opacity: 0 },
        transition: { type: "spring" as const, stiffness: 300, damping: 36 },
      };
}

function getPromotionPopupMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, scale: 1, y: 0 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 1, scale: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return motionMode === "reduced"
    ? {
        initial: { opacity: 0, scale: 0.985 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.99 },
        transition: { duration: 0.14, ease: "easeOut" as const },
      }
    : {
        initial: { opacity: 0, scale: 0.92, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: 4 },
        transition: { type: "spring" as const, stiffness: 360, damping: 28 },
      };
}

function getCueMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, scale: 1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 1, scale: 1 },
      transition: { duration: 0 },
    };
  }

  return motionMode === "reduced"
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12, ease: "easeOut" as const },
      }
    : {
        initial: { scale: 0.85, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.92, opacity: 0 },
        transition: { type: "spring" as const, stiffness: 400, damping: 30 },
      };
}

function getCueDetailMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { height: "auto", opacity: 1 },
      animate: { height: "auto", opacity: 1 },
      exit: { height: "auto", opacity: 1 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: motionMode === "reduced" ? 0.14 : 0.2 },
  };
}

function getToastMotionProps(motionMode: OverlayMotionMode) {
  if (motionMode === "off") {
    return {
      initial: { opacity: 1, y: 0 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }

  return {
    initial: { opacity: 0, y: motionMode === "reduced" ? -4 : -12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: motionMode === "reduced" ? -4 : -12 },
    transition: { duration: motionMode === "reduced" ? 0.14 : 0.22, ease: "easeOut" as const },
  };
}

function getBootScrimExitProps(motionMode: OverlayMotionMode) {
  return motionMode === "off" ? { opacity: 1 } : { opacity: 0 };
}

function getBootScrimTransition(motionMode: OverlayMotionMode) {
  return { duration: motionMode === "off" ? 0 : motionMode === "reduced" ? 0.2 : 0.4 };
}

function getBlockedFeedback(
  reason: InteractionBlockReason,
  locale: GameSession["settings"]["locale"],
): { detail: string; icon: string; summary: string } {
  switch (reason) {
    case "opponent-piece":
      return {
        summary: t(locale, "feedback.blockedPiece.summary"),
        detail: t(locale, "feedback.blockedPiece.detail"),
        icon: "!",
      };
    case "analysis-active":
      return {
        summary: t(locale, "feedback.analysisLocked.summary"),
        detail: t(locale, "feedback.analysisLocked.detail"),
        icon: "∿",
      };
    case "promotion-pending":
      return {
        summary: t(locale, "feedback.promotionPending.summary"),
        detail: t(locale, "feedback.promotionPending.detail"),
        icon: "♛",
      };
    case "inactive-session":
      return {
        summary: t(locale, "feedback.inactiveSession.summary"),
        detail: t(locale, "feedback.inactiveSession.detail"),
        icon: "!",
      };
    case "out-of-turn":
    default:
      return {
        summary: t(locale, "feedback.blockedTurn.summary"),
        detail: t(locale, "feedback.blockedTurn.detail"),
        icon: "!",
      };
  }
}

function getCheckmateLabel(locale: GameSession["settings"]["locale"]): string {
  return locale === "pt-BR" ? "Xeque-mate" : "Checkmate";
}

function getLowTimeToastLabel(
  locale: GameSession["settings"]["locale"],
  sideLabel: string,
  time: number,
): string {
  return locale === "pt-BR"
    ? `Tempo baixo: ${sideLabel} ${formatClock(time)}`
    : `Low time: ${sideLabel} ${formatClock(time)}`;
}

function getSecondRepetitionLabel(locale: GameSession["settings"]["locale"]): string {
  return locale === "pt-BR"
    ? "Segunda repetição: mais uma repete a posição."
    : "Second repetition: one more repeat draws the game.";
}

function getFiftyMoveWarningLabel(
  locale: GameSession["settings"]["locale"],
  halfmoveClock: number,
): string {
  const remaining = Math.max(0, 100 - halfmoveClock);
  return locale === "pt-BR"
    ? `Regra dos 50 lances se aproxima: faltam ${remaining} meios-lances sem captura ou peão.`
    : `50-move rule approaching: ${remaining} halfmoves left without a pawn move or capture.`;
}

function syncNewGameForm(
  clockConfig: ClockConfig,
  difficultyId: string,
  setDifficultyId: (value: string) => void,
  setClockKey: (value: string) => void,
  setMinutes: (value: string) => void,
  setIncrement: (value: string) => void,
) {
  setDifficultyId(difficultyId);
  setMinutes(String(Math.max(0, Math.round(clockConfig.baseMs / 60_000))));
  setIncrement(String(Math.max(0, Math.round(clockConfig.incrementMs / 1_000))));

  const preset = NEW_GAME_CLOCK_PRESETS.find((option) => getClockKey(option) === getClockKey(clockConfig));
  setClockKey(preset ? getClockKey(preset) : "custom");
}

function resolveSheetClockConfig(
  selectedClockKey: string,
  customMinutes: string,
  customIncrement: string,
  locale: GameSession["settings"]["locale"],
): ClockConfig {
  if (selectedClockKey !== "custom") {
    return NEW_GAME_CLOCK_PRESETS.find((preset) => getClockKey(preset) === selectedClockKey) ?? NEW_GAME_CLOCK_PRESETS[2];
  }

  const minutes = Math.max(0, Number(customMinutes) || 0);
  const increment = Math.max(0, Number(customIncrement) || 0);

  return {
    enabled: minutes > 0,
    label: minutes > 0 ? (increment > 0 ? `${minutes} + ${increment}` : `${minutes} min`) : t(locale, "clock.none"),
    baseMs: minutes * 60_000,
    incrementMs: increment * 1_000,
  };
}

function getClockKey(clockConfig: ClockConfig): string {
  return `${clockConfig.enabled ? "on" : "off"}:${clockConfig.baseMs}:${clockConfig.incrementMs}`;
}

function formatClockChoiceLabel(clockConfig: ClockConfig, locale: GameSession["settings"]["locale"]): string {
  if (!clockConfig.enabled) {
    return t(locale, "clock.off");
  }

  const minutes = Math.max(0, Math.round(clockConfig.baseMs / 60_000));
  const increment = Math.max(0, Math.round(clockConfig.incrementMs / 1_000));
  return increment > 0 ? `${minutes}+${increment}` : String(minutes);
}

function formatDifficultyTickLabel(difficulty: ReturnType<typeof getDifficultyPreset>): string {
  return difficulty.uciElo === null ? "MAX" : String(difficulty.uciElo);
}

function formatDifficultyAriaValue(difficulty: ReturnType<typeof getDifficultyPreset>): string {
  return difficulty.uciElo === null
    ? `${difficulty.label} max`
    : `${difficulty.label} ${difficulty.uciElo}`;
}

function getDifficultyStopStyle(index: number, total: number): CSSProperties {
  return {
    "--difficulty-stop": `${(index / Math.max(1, total - 1)) * 100}%`,
  } as CSSProperties;
}

function canResumeSession(session: GameSession): boolean {
  return session.snapshot.status === "idle" || session.snapshot.status === "active";
}

function canAnalyzeSession(session: GameSession): boolean {
  return session.moveEntries.length > 0;
}

function hasReplaceableGame(session: GameSession): boolean {
  return (
    session.moveEntries.length > 0 &&
    (session.snapshot.status === "active" || session.snapshot.status === "idle")
  );
}

function buildSaveSummary(
  session: GameSession,
  updatedAt: string,
  locale: GameSession["settings"]["locale"],
): string {
  return [
    formatAbsoluteTimestamp(updatedAt, locale),
    t(locale, getResultStatusKey(session.snapshot.status)),
    getDifficultyPreset(session.settings.difficultyId).label,
    `${session.moveEntries.length} ${t(locale, "hud.moves").toLowerCase()}`,
  ].join(" · ");
}

function getAnalysisSectionSubtitle(
  session: GameSession,
  locale: GameSession["settings"]["locale"],
  analysisSummaryCount: number,
  analysisProgress: { completed: number; total: number } | null,
): string {
  if (analysisProgress) {
    return t(locale, "section.analysis.subtitle.progress", {
      completed: analysisProgress.completed,
      total: analysisProgress.total,
    });
  }

  if (analysisSummaryCount > 0) {
    return t(locale, "section.analysis.subtitle.ready", { count: analysisSummaryCount });
  }

  return session.moveEntries.length > 0
    ? t(locale, "section.analysis.subtitle.empty")
    : t(locale, "section.analysis.subtitle.waiting");
}

function getLibrarySectionSubtitle(
  autosaveTimestamp: string | null,
  saveCount: number,
  locale: GameSession["settings"]["locale"],
): string {
  if (autosaveTimestamp) {
    return t(locale, "section.library.subtitle.autosave", { time: autosaveTimestamp });
  }

  if (saveCount > 0) {
    return t(locale, "section.library.subtitle.ready", { count: saveCount });
  }

  return t(locale, "section.library.subtitle.empty");
}

function buildMoveHistorySummary(
  session: GameSession,
  locale: GameSession["settings"]["locale"],
): string {
  if (session.moveEntries.length === 0) {
    return t(locale, "section.moves.subtitle.empty");
  }

  return t(locale, "section.moves.subtitle.last", {
    count: session.moveEntries.length,
    move: session.moveEntries.at(-1)?.san ?? "—",
  });
}

function getHistoryProgress(moveCount: number, currentPly: number, analysisMode: boolean): number {
  if (moveCount === 0) {
    return 0;
  }

  if (!analysisMode) {
    return 100;
  }

  return clamp((currentPly / moveCount) * 100, 8, 100);
}

function formatSensitivityValue(value: number): string {
  return `${value.toFixed(2)}x`;
}

function buildPgnFilename(label?: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  const slug = label?.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  return slug ? `pipo-chess-${slug}-${timestamp}.pgn` : `pipo-chess-${timestamp}.pgn`;
}

function getExportToastKey(result: ExportTextResult): TranslationKey {
  switch (result) {
    case "shared":
      return "save.exportShared";
    case "copied":
      return "save.exportCopied";
    default:
      return "save.exportDownloaded";
  }
}

function getBoardCueStyle(anchor: { x: number; y: number }): CSSProperties {
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const clampedX = clamp(anchor.x, 60, Math.max(60, viewportWidth - 60));
  return {
    left: `${clampedX}px`,
    top: `${Math.max(24, anchor.y)}px`,
  };
}

function getBootProgress(phase: EnginePhase): number {
  switch (phase) {
    case "booting":
      return 38;
    case "ready":
      return 100;
    case "thinking":
      return 86;
    case "analyzing":
      return 92;
    case "error":
      return 100;
    default:
      return 52;
  }
}

function getStatusKey(
  phase: GameSession["snapshot"]["status"] | "booting" | "ready" | "thinking" | "analyzing" | "error",
) {
  if (phase === "booting") {
    return "status.loading";
  }
  if (phase === "thinking") {
    return "status.thinking";
  }
  if (phase === "analyzing") {
    return "status.analyzing";
  }
  if (phase === "error") {
    return "status.error";
  }
  return "status.ready";
}

function isTerminalStatus(status: GameSession["snapshot"]["status"]): boolean {
  return status !== "idle" && status !== "active";
}

function getFriendlyResultKey(session: GameSession): TranslationKey {
  if (session.snapshot.status === "checkmate") {
    return session.snapshot.sideToMove === session.playerColor ? "result.loss" : "result.win";
  }

  if (session.snapshot.status === "timeout") {
    return session.snapshot.clockState.expiredColor === session.playerColor ? "result.loss" : "result.win";
  }

  return "result.drawFriendly";
}

function getResultGlyph(session: GameSession): string {
  if (session.snapshot.status === "checkmate") {
    return session.snapshot.sideToMove === session.playerColor ? "♚" : "♔";
  }
  if (session.snapshot.status === "timeout") {
    return "⌛";
  }
  return "½";
}

function getResultStatusKey(status: GameSession["snapshot"]["status"]): TranslationKey {
  switch (status) {
    case "checkmate":
      return "result.checkmate";
    case "stalemate":
      return "result.stalemate";
    case "draw":
      return "result.draw";
    case "threefold":
      return "result.threefold";
    case "insufficient":
      return "result.insufficient";
    case "timeout":
      return "result.timeout";
    default:
      return "result.active";
  }
}

function getEvaluationForPly(
  evaluationsByPly: Record<number, PositionEvaluation> | undefined,
  ply: number,
): PositionEvaluation | null {
  return evaluationsByPly?.[ply] ?? null;
}

function normalizeEvaluationScore(evaluation: PositionEvaluation | null): number {
  if (!evaluation) {
    return 0;
  }
  if (evaluation.scoreMate !== null) {
    return evaluation.scoreMate > 0 ? 900 : -900;
  }
  return clamp(evaluation.scoreCp ?? 0, -900, 900);
}

function formatEvaluationLabel(
  evaluation: PositionEvaluation | null,
  locale: GameSession["settings"]["locale"],
): string {
  if (!evaluation) {
    return t(locale, "analysis.evalNeutral");
  }
  if (evaluation.scoreMate !== null) {
    return `M${Math.abs(evaluation.scoreMate)}`;
  }

  const value = (evaluation.scoreCp ?? 0) / 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function getPromotionGlyph(piece: PieceSymbol, color: Color): string {
  const glyphs: Record<Color, Record<PieceSymbol, string>> = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
  };

  return glyphs[color][piece];
}

function getPromotionKey(piece: (typeof PROMOTION_CHOICES)[number]): TranslationKey {
  switch (piece) {
    case "q":
      return "promotion.q";
    case "r":
      return "promotion.r";
    case "b":
      return "promotion.b";
    default:
      return "promotion.n";
  }
}

export default App;
