import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type Ref,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Color, PieceSymbol, Square } from "chess.js";
import { soundService } from "./audio/soundService";
import { haptics } from "./hooks/useHaptics";
import {
  ActionButton,
  ChipButton,
  ClockPill,
  type ClockSideState,
  MenuSection,
} from "./components/AppShellPrimitives";
import { ChessScene } from "./components/ChessScene";
import { AnalysisSummaryView } from "./components/AnalysisSummaryView";
import { CameraPickerPanel } from "./components/CameraPickerPanel";
import { ReplaceGameDialog, ResultModalOverlay } from "./components/DecisionOverlays";
import { HistoryPanel } from "./components/HistoryPanel";
import { clockPresets } from "./data/clocks";
import { difficultyPresets, getDifficultyPreset } from "./data/difficulties";
import { getTheme, getThemeCssVariables, themes } from "./data/themes";
import { deriveSessionAtPly, diagnoseIllegalMove, formatIllegalMoveDiagnosis } from "./game/gameService";
import { getLocaleLabel, t } from "./i18n";
import { locales } from "./i18n/dictionaries";
import { useGameStore } from "./state/gameStore";
import type {
  CameraPreset,
  ClockConfig,
  EnginePhase,
  GameSession,
  NewGameColorChoice,
  PositionEvaluation,
} from "./types/game";
import { fenToPieces } from "./utils/board";
import { clamp, formatAbsoluteTimestamp, formatRelativeTimestamp } from "./utils/format";
import { exportTextContent, readTextFile, type ExportTextResult } from "./utils/files";

type TranslationKey = Parameters<typeof t>[1];

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

function App() {
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
    analysisCursor,
    analysisAutoplay,
    analysisProgress,
    cameraPreset,
    restoreNotice,
    lastError,
    bootstrap,
    selectSquare,
    confirmPromotion,
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
  } = useGameStore();
  const [topBarExpanded, setTopBarExpanded] = useState(false);
  const [bottomBarExpanded, setBottomBarExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const [transientNotice, setTransientNotice] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [promotionAnchor, setPromotionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [invalidMoveSquare, setInvalidMoveSquare] = useState<Square | null>(null);
  const [invalidMoveSummary, setInvalidMoveSummary] = useState<string | null>(null);
  const [invalidMoveDetail, setInvalidMoveDetail] = useState<string | null>(null);
  const [invalidMoveExpanded, setInvalidMoveExpanded] = useState(false);
  const [invalidMoveAnchor, setInvalidMoveAnchor] = useState<{ x: number; y: number } | null>(null);
  const [castlingAnchor, setCastlingAnchor] = useState<{ x: number; y: number } | null>(null);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastFinishedGameRef = useRef<string | null>(null);
  const deferredMoves = useDeferredValue(session.snapshot.moveList);
  const locale = session.settings.locale;
  const theme = getTheme(session.settings.themeId);
  const style = getThemeCssVariables(theme) as CSSProperties;
  const qualityMode = session.settings.qualityMode;
  const manualQualityTier = session.settings.manualQualityTier;
  const activeDifficulty = getDifficultyPreset(session.settings.difficultyId);
  const boardSession = analysisCursor === null ? session : deriveSessionAtPly(session, analysisCursor);
  const analysisMode = analysisCursor !== null;
  const toastMessage = restoreNotice ?? transientNotice ?? transientError ?? lastError;
  const isErrorToast = !restoreNotice && !transientNotice && !!(transientError || lastError);
  const currentPly = analysisCursor ?? session.moveEntries.length;
  const currentEvaluation = getEvaluationForPly(session.analysisSummary?.evaluationsByPly, currentPly);
  const autosaveTimestamp = autosave ? formatRelativeTimestamp(autosave.updatedAt, locale) : null;
  const bootProgress = getBootProgress(enginePhase);
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

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    syncNewGameForm(
      session.settings.clockConfig,
      session.settings.difficultyId,
      setNewGameDifficultyId,
      setSelectedClockKey,
      setCustomMinutes,
      setCustomIncrement,
    );
  }, [session.settings.clockConfig, session.settings.difficultyId]);

  useEffect(() => {
    if (isTerminalStatus(session.snapshot.status)) {
      if (lastFinishedGameRef.current !== session.snapshot.pgn) {
        setResultModalOpen(true);
        lastFinishedGameRef.current = session.snapshot.pgn;
        soundService.play("game-over");
        haptics.gameOver();
      }
      return;
    }

    setResultModalOpen(false);
    lastFinishedGameRef.current = null;
  }, [session.snapshot.pgn, session.snapshot.status]);

  const prevMoveLengthRef = useRef(0);
  useEffect(() => {
    const moveCount = session.moveEntries.length;
    if (!booted) {
      prevMoveLengthRef.current = moveCount;
      return;
    }
    if (moveCount < prevMoveLengthRef.current) {
      prevMoveLengthRef.current = moveCount;
      soundService.play("undo");
      haptics.light();
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

    if (isCapture) {
      soundService.play("piece-capture");
      haptics.heavy();
    } else if (isCastle) {
      soundService.play("castle");
      haptics.medium();
    } else {
      soundService.play("piece-move");
      haptics.medium();
    }

    // Check or checkmate notification (after move sound settles)
    if (lastEntry.san.includes("+") || lastEntry.san.includes("#")) {
      window.setTimeout(() => {
        soundService.play("check");
        haptics.check();
      }, 80);
    }
  }, [session.moveEntries, session.moveEntries.length, booted]);

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
    if (!transientNotice && !transientError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setTransientNotice(null);
      setTransientError(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [transientError, transientNotice]);

  useEffect(() => {
    if (!invalidMoveSquare) return;
    const delay = invalidMoveExpanded ? 4000 : 1800;
    const timeout = window.setTimeout(() => {
      setInvalidMoveSquare(null);
      setInvalidMoveSummary(null);
      setInvalidMoveDetail(null);
      setInvalidMoveExpanded(false);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [invalidMoveSquare, invalidMoveExpanded]);

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
        setBottomBarExpanded(true);
      });
      setTransientNotice(null);
      setTransientError(null);
    } catch {
      setTransientError(t(locale, "save.importError"));
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

      setTransientError(null);
      setTransientNotice(t(locale, getExportToastKey(result)));
    } catch {
      setTransientNotice(null);
      setTransientError(t(locale, "save.exportError"));
    }
  };

  const openSavedAnalysis = async (targetSession: GameSession, loader: () => Promise<void>) => {
    await loader();
    startTransition(() => {
      setResultModalOpen(false);
      setMenuOpen(false);
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
      setCameraPickerOpen(false);
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
      setAnalysisAutoplay(false);
      setAnalysisCursor(null);
    });
  };

  const enterAnalysis = async () => {
    startTransition(() => {
      setResultModalOpen(false);
      setMenuOpen(false);
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

  const topSide = buildClockSide(topColor, session, locale);
  const bottomSide = buildClockSide(bottomColor, session, locale);

  return (
    <div
      className={`app-shell${analysisMode ? " is-analysis" : ""}${isZenMode ? " is-zen" : ""}`}
      ref={appShellRef}
      style={style}
    >
      <div className="canvas-backdrop" />
      <div className="backdrop-orb backdrop-orb--primary" />
      <div className="backdrop-orb backdrop-orb--secondary" />

      <main className="stage-root">
        <div className="stage-playfield">
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
            castlingTargets={analysisMode ? [] : castlingTargets}
            onSquareSelect={(square) => {
              if (analysisMode) {
                return;
              }
              if (
                selectedSquare &&
                legalTargets.length > 0 &&
                !legalTargets.includes(square)
              ) {
                const pieces = fenToPieces(session.snapshot.fen);
                const isPlayerPiece = pieces.some(
                  (p) => p.square === square && p.color === session.playerColor,
                );
                if (!isPlayerPiece) {
                  const diagnosis = diagnoseIllegalMove(session, selectedSquare, square);
                  const formatted = formatIllegalMoveDiagnosis(diagnosis, locale);
                  setInvalidMoveSummary(formatted.summary);
                  setInvalidMoveDetail(formatted.detail);
                  setInvalidMoveExpanded(false);
                  setInvalidMoveSquare(square);
                  soundService.play("invalid-move");
                  haptics.light();
                  return;
                }
              }
              haptics.light();
              soundService.play("piece-select");
              void selectSquare(square);
            }}
            onPromotionAnchorChange={setPromotionAnchor}
            onInvalidMoveAnchorChange={setInvalidMoveAnchor}
            onCastlingAnchorChange={setCastlingAnchor}
          />
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

      <motion.button
        className={`history-tab ${historyOpen ? "is-open" : ""}`}
        type="button"
        aria-label={t(locale, "history.toggle")}
        animate={{ opacity: isZenMode ? 0 : 1 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ pointerEvents: isZenMode ? "none" : undefined }}
        onClick={() => {
          startTransition(() => {
            setHistoryOpen((value) => !value);
          });
        }}
      >
        <span className="history-tab__icon" aria-hidden="true">
          ◫
        </span>
        <span className="history-tab__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="history-tab__label">{analysisMode ? t(locale, "history.analysis") : t(locale, "history.pgn")}</span>
      </motion.button>

      <motion.section
        className={`top-bar ${topBarExpanded ? "is-expanded" : ""}`}
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
                <small>{analysisMode ? t(locale, "history.analysis") : t(locale, "hud.localAi")}</small>
              </div>
            </div>
          </div>
          <div className="top-bar__island top-bar__island--timers">
            <div className="top-bar__timers">
              <ClockPill side={topSide} collapsed={!topBarExpanded} />
              <ClockPill side={bottomSide} collapsed={!topBarExpanded} />
            </div>
          </div>
          <div className="top-bar__island top-bar__island--engine">
            <div className="top-bar__engine">
              <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
              <strong>{activeDifficulty.label}</strong>
              <small>{engineMessage || t(locale, getStatusKey(enginePhase))}</small>
            </div>
            <button
              className="bar-toggle top-bar__toggle"
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
          </div>
        </div>
      </motion.section>

      <motion.section
        className={`bottom-bar ${bottomBarExpanded ? "is-expanded" : ""}`}
        animate={{
          opacity: isZenMode ? 0 : 1,
          height: isZenMode ? 0 : "auto",
          marginBlock: isZenMode ? 0 : undefined,
          paddingBlock: isZenMode ? 0 : undefined,
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ overflow: "hidden", pointerEvents: isZenMode ? "none" : undefined }}
      >
        <div className="bottom-bar__cluster bottom-bar__cluster--primary">
          {analysisMode ? (
            <>
              <ActionButton
                icon="⏮"
                label={t(locale, "analysis.start")}
                compact={!bottomBarExpanded}
                onClick={() => {
                  setAnalysisAutoplay(false);
                  setAnalysisCursor(0);
                }}
              />
              <ActionButton
                icon="◀"
                label={t(locale, "analysis.previous")}
                compact={!bottomBarExpanded}
                disabled={currentPly <= 0}
                onClick={() => {
                  setAnalysisAutoplay(false);
                  setAnalysisCursor(currentPly - 1);
                }}
              />
              <ActionButton
                icon={analysisAutoplay ? "⏸" : "▶"}
                label={t(locale, analysisAutoplay ? "analysis.pause" : "analysis.play")}
                compact={!bottomBarExpanded}
                tone="primary"
                onClick={() => setAnalysisAutoplay(!analysisAutoplay)}
              />
              <ActionButton
                icon="▶"
                label={t(locale, "analysis.next")}
                compact={!bottomBarExpanded}
                disabled={currentPly >= session.moveEntries.length}
                onClick={() => {
                  setAnalysisAutoplay(false);
                  setAnalysisCursor(currentPly + 1);
                }}
              />
              <ActionButton
                icon="⏭"
                label={t(locale, "analysis.end")}
                compact={!bottomBarExpanded}
                onClick={() => {
                  setAnalysisAutoplay(false);
                  setAnalysisCursor(session.moveEntries.length);
                }}
              />
              <ActionButton
                icon="↩"
                label={t(locale, "analysis.exit")}
                compact={!bottomBarExpanded}
                onClick={() => {
                  setAnalysisAutoplay(false);
                  setAnalysisCursor(null);
                }}
              />
            </>
          ) : (
            <>
              <ActionButton
                icon="＋"
                label={t(locale, "hud.newGame")}
                compact={!bottomBarExpanded}
                tone="primary"
                onClick={openNewGameSheet}
              />
              <ActionButton
                icon="↺"
                label={t(locale, "hud.undo")}
                compact={!bottomBarExpanded}
                disabled={!session.snapshot.canUndo}
                onClick={() => void undo()}
              />
              <ActionButton
                icon="↻"
                label={t(locale, "hud.redo")}
                compact={!bottomBarExpanded}
                disabled={!session.snapshot.canRedo}
                onClick={() => void redo()}
              />
              <ActionButton
                icon="💡"
                label={t(locale, "hud.hint")}
                compact={!bottomBarExpanded}
                disabled={isHintDisabled}
                loading={enginePhase === "thinking" && session.snapshot.sideToMove === session.playerColor}
                onClick={() => void requestHint()}
              />
            </>
          )}
        </div>
        <div className="bottom-bar__cluster bottom-bar__cluster--utility">
          <ActionButton
            icon={isZenMode ? "◎" : "○"}
            label={t(locale, "hud.zen")}
            compact={!bottomBarExpanded}
            onClick={() => setIsZenMode((v) => !v)}
          />
          <ActionButton
            icon="🎥"
            label={t(locale, "hud.camera")}
            compact={!bottomBarExpanded}
            onClick={() => {
              startTransition(() => {
                setCameraPickerOpen((value) => !value);
                setMenuOpen(false);
              });
            }}
          />
          <ActionButton
            icon="☰"
            label={t(locale, "hud.menu")}
            compact={!bottomBarExpanded}
            onClick={() => {
              startTransition(() => {
                setMenuOpen((value) => !value);
                setCameraPickerOpen(false);
              });
            }}
          />
          <button
            className="bar-toggle bottom-bar__toggle"
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
      </motion.section>

      <AnimatePresence>
        {historyOpen && (
          <HistoryPanel
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
            onClose={() => setHistoryOpen(false)}
            onSelectPly={(ply) => {
              setAnalysisAutoplay(false);
              setAnalysisCursor(ply);
            }}
          />
        )}
      </AnimatePresence>

      {cameraPickerOpen ? (
        <div
          className="overlay-scrim"
          aria-hidden="true"
          onClick={() => setCameraPickerOpen(false)}
        />
      ) : null}

      <AnimatePresence>
        {cameraPickerOpen && (
          <CameraPickerPanel
            cameraPreset={cameraPreset}
            presets={CAMERA_PRESETS.map((preset) => ({
              id: preset.id,
              icon: preset.icon,
              label: t(locale, preset.labelKey),
            }))}
            title={t(locale, "hud.camera")}
            kicker={t(locale, "camera.kicker")}
            onSelectPreset={(preset) => {
              setCameraPreset(preset);
              setCameraPickerOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {menuOpen ? (
        <div
          className="overlay-scrim"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <AnimatePresence>
        {menuOpen && (
          <motion.aside
            className="menu-drawer"
            initial={{ x: "110%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "110%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 36 }}
            style={{ pointerEvents: "auto" }}
          >
            <div className="menu-drawer__shell">
              <div className="panel-header menu-drawer__header">
                <div className="panel-header__cluster">
                  <span className="panel-header__glyph" aria-hidden="true">
                    ☰
                  </span>
                  <div>
                    <p className="panel-kicker">{t(locale, "menu.kicker")}</p>
                    <h2>{t(locale, "hud.menu")}</h2>
                    <p className="menu-drawer__subtitle">{historySessionSubtitle}</p>
                  </div>
                </div>
                <div className="panel-header__meta">
                  <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
                  <button
                    className="ghost-icon-button"
                    type="button"
                    aria-label={t(locale, "panel.close")}
                    onClick={() => setMenuOpen(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="menu-drawer__scroll">

                <MenuSection
                  badge={analysisSummaryCount > 0 ? String(analysisSummaryCount) : undefined}
                  subtitle={analysisSectionSubtitle}
                  title={t(locale, "section.analysis.title")}
                  tone="analysis"
                >
                  <div className="inline-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={session.moveEntries.length === 0}
                      onClick={() => void enterAnalysis()}
                    >
                      {analysisProgress ? t(locale, "analysis.running") : t(locale, "analysis.open")}
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={session.moveEntries.length === 0 || !!analysisProgress}
                      onClick={() => void runAnalysis()}
                    >
                      {t(locale, "panel.analysis.run")}
                    </button>
                  </div>
                  <AnalysisSummaryView summary={session.analysisSummary} locale={locale} />
                </MenuSection>

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
                          <button className="ghost-button save-action-button" data-icon="▶" type="button" onClick={() => void resumeSavedSession(restoreAutosave)}>
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
                        <button className="ghost-button save-action-button" data-icon="↗" type="button" onClick={() => void handleExportSession(autosave.session, "autosave")}>
                          {t(locale, "hud.export")}
                        </button>
                      </div>
                    </article>
                  ) : null}

                  <div className="inline-actions inline-actions--library">
                    <button className="primary-button library-action-button" data-icon="+" type="button" onClick={() => void createManualSave()}>
                      {t(locale, "panel.saveLoad.create")}
                    </button>
                    <button className="ghost-button library-action-button" data-icon="↧" type="button" onClick={() => fileInputRef.current?.click()}>
                      {t(locale, "hud.import")}
                    </button>
                    <button className="ghost-button library-action-button" data-icon="↗" type="button" onClick={() => void handleExportSession(session)}>
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
                          <button className="ghost-button save-action-button" data-icon="×" type="button" onClick={() => void deleteManualSave(save.id!)}>
                            {t(locale, "panel.saveLoad.delete")}
                          </button>
                        </div>
                      </article>
                    ))}
                    {saveSlots.length === 0 ? <p className="muted-copy">{t(locale, "panel.saveLoad.empty")}</p> : null}
                  </div>
                </MenuSection>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newGameOpen && (
          <motion.div
            className="overlay-scrim"
            key="new-game-scrim"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setNewGameOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newGameOpen && (
          <motion.section
            className="new-game-sheet"
            key="new-game-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t(locale, "panel.newGame.title")}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            style={{ pointerEvents: "auto" }}
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
            </div>

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
              <div className="slider-block">
                <strong>{getDifficultyPreset(newGameDifficultyId).label}</strong>
                <input
                  aria-label={t(locale, "newGame.level")}
                  max={difficultyPresets.length - 1}
                  min={0}
                  type="range"
                  value={selectedDifficultyIndex}
                  onChange={(event) => {
                    const index = Number(event.target.value);
                    setNewGameDifficultyId(difficultyPresets[index]?.id ?? difficultyPresets[0].id);
                  }}
                />
                <div className="slider-labels">
                  {difficultyPresets.map((preset) => (
                    <span key={preset.id}>{preset.label}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h3>{t(locale, "panel.clock.title")}</h3>
              <div className="chip-row chip-row--wrap">
                {NEW_GAME_CLOCK_PRESETS.map((preset) => (
                  <ChipButton
                    key={getClockKey(preset)}
                    active={selectedClockKey === getClockKey(preset)}
                    onClick={() => setSelectedClockKey(getClockKey(preset))}
                  >
                    {formatClockPresetLabel(preset, locale)}
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

            <button className="primary-button primary-button--full" type="button" onClick={() => void applyNewGame()}>
              {t(locale, "panel.newGame.confirm")}
            </button>
          </motion.section>
        )}
      </AnimatePresence>

      {pendingPromotion ? (
        <section
          className="promotion-popup"
          role="dialog"
          aria-label={t(locale, "promotion.title")}
          style={getPromotionPopupStyle(promotionAnchor)}
        >
          <p className="panel-kicker promotion-popup__kicker">{t(locale, "promotion.title")}</p>
          <div className="promotion-options">
            {PROMOTION_CHOICES.map((piece) => (
              <button
                className="promotion-option"
                key={piece}
                type="button"
                onClick={() => void confirmPromotion(piece)}
              >
                <span className="promotion-option__well" aria-hidden="true">
                  <span className="promotion-option__glyph">{getPromotionGlyph(piece, session.playerColor)}</span>
                </span>
                <small className="promotion-option__label">{t(locale, getPromotionKey(piece))}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <AnimatePresence>
        {invalidMoveSquare && invalidMoveAnchor ? (
          <motion.div
            className={`board-cue board-cue--invalid${invalidMoveExpanded ? " board-cue--expanded" : ""}`}
            key="invalid-move-cue"
            style={{
              ...getBoardCueStyle(invalidMoveAnchor),
              ...(invalidMoveDetail ? { cursor: "pointer", pointerEvents: "auto" as const } : {}),
            }}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            onClick={invalidMoveDetail ? () => setInvalidMoveExpanded((v) => !v) : undefined}
          >
            <span className="board-cue__summary">
              <span className="board-cue__glyph" aria-hidden="true">!</span>
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
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {invalidMoveDetail}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {castlingTargets.length > 0 && castlingAnchor ? (
          <motion.div
            className="board-cue board-cue--castling"
            key="castling-cue"
            style={getBoardCueStyle(castlingAnchor)}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <span className="board-cue__summary">
              <span className="board-cue__glyph" aria-hidden="true">♜</span>
              <span className="board-cue__summary-text">{t(locale, "feedback.castling")}</span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {replacePromptOpen ? (
        <ReplaceGameDialog
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
            open={resultModalOpen}
            kicker={t(locale, "result.kicker")}
            glyph={getResultGlyph(session)}
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
        {toastMessage ? (
          <motion.div
            aria-live={isErrorToast ? "assertive" : "polite"}
            className={`toast ${isErrorToast ? "is-error" : "is-notice"}`}
            key="toast"
            role={isErrorToast ? "alert" : "status"}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <span className="toast__icon" aria-hidden="true">
              {isErrorToast ? "!" : restoreNotice ? "↺" : "•"}
            </span>
            <span className="toast__message">{toastMessage}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!booted && (
          <motion.div
            className="boot-scrim"
            key="boot-scrim"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
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
              <small className="boot-scrim__meta">{engineMessage || t(locale, getStatusKey(enginePhase))}</small>
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

  return {
    label: isPlayer ? t(locale, "hud.you") : t(locale, "hud.localAi"),
    subtitle: isPlayer ? t(locale, "hud.player") : `${t(locale, "hud.engine")} · ${getDifficultyPreset(session.settings.difficultyId).label}`,
    time: color === "w" ? session.snapshot.clockState.whiteMs : session.snapshot.clockState.blackMs,
    active: session.snapshot.clockState.activeColor === color,
    thinking:
      !isPlayer &&
      session.snapshot.clockState.activeColor === color &&
      session.snapshot.status === "active",
  };
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

function formatClockPresetLabel(clockConfig: ClockConfig, locale: GameSession["settings"]["locale"]): string {
  return clockConfig.enabled ? clockConfig.label : t(locale, "clock.none");
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
    : t(locale, "panel.analysis.empty");
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

export function getPromotionPopupStyle(anchor: { x: number; y: number } | null): CSSProperties | undefined {
  if (!anchor) {
    return undefined;
  }

  const popupHalfWidth = 156;
  const popupHeight = 196;
  const edgePadding = 24;
  const safeViewportWidth =
    typeof window === "undefined" ? popupHalfWidth * 2 : Math.max(window.innerWidth, popupHalfWidth * 2);
  const safeViewportHeight =
    typeof window === "undefined"
      ? popupHeight + edgePadding * 2
      : Math.max(window.innerHeight, popupHeight + edgePadding * 2);
  const placeBelow = anchor.y < popupHeight + edgePadding;
  const clampedX = clamp(anchor.x, popupHalfWidth, Math.max(popupHalfWidth, safeViewportWidth - popupHalfWidth));
  const clampedTop = placeBelow
    ? clamp(anchor.y, edgePadding, Math.max(edgePadding, safeViewportHeight - popupHeight - edgePadding))
    : clamp(anchor.y, popupHeight + edgePadding, Math.max(popupHeight + edgePadding, safeViewportHeight - edgePadding));

  return {
    left: `${clampedX}px`,
    top: `${clampedTop}px`,
    transform: placeBelow ? "translate(-50%, 0.75rem)" : "translate(-50%, calc(-100% - 0.75rem))",
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
