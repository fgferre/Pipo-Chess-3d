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
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Color, PieceSymbol } from "chess.js";
import { soundService } from "./audio/soundService";
import { haptics } from "./hooks/useHaptics";
import { ChessScene, type ViewportPadding } from "./components/ChessScene";
import { MoveList } from "./components/MoveList";
import { AnalysisSummaryView } from "./components/AnalysisSummaryView";
import { clockPresets } from "./data/clocks";
import { difficultyPresets, getDifficultyPreset } from "./data/difficulties";
import { getTheme, getThemeCssVariables, themes } from "./data/themes";
import { deriveSessionAtPly } from "./game/gameService";
import { getLocaleLabel, t } from "./i18n";
import { locales } from "./i18n/dictionaries";
import { useGameStore } from "./state/gameStore";
import type {
  CameraPreset,
  ClockConfig,
  GameSession,
  NewGameColorChoice,
  PositionEvaluation,
} from "./types/game";
import { clamp, formatAbsoluteTimestamp, formatClock, formatRelativeTimestamp } from "./utils/format";
import { exportTextContent, readTextFile, type ExportTextResult } from "./utils/files";

type TranslationKey = Parameters<typeof t>[1];

const NEW_GAME_CLOCK_PRESETS = clockPresets;
const CAMERA_PRESETS: Array<{ id: CameraPreset; icon: string; labelKey: TranslationKey }> = [
  { id: "classic", icon: "◢", labelKey: "camera.classic" },
  { id: "side", icon: "▤", labelKey: "camera.side" },
  { id: "topdown", icon: "▣", labelKey: "camera.topdown" },
  { id: "2d", icon: "□", labelKey: "camera.2d" },
];
const PROMOTION_CHOICES = ["q", "r", "b", "n"] as const;
const EMPTY_VIEWPORT_PADDING: ViewportPadding = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
const EDGE_CAPTURE_TOLERANCE_PX = 32;

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
    setAnimationMode,
    setDefaultViewMode,
    setCameraSensitivity,
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
  const [viewportPadding, setViewportPadding] = useState<ViewportPadding>(EMPTY_VIEWPORT_PADDING);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const topBarRef = useRef<HTMLElement | null>(null);
  const bottomBarRef = useRef<HTMLElement | null>(null);
  const historyPanelRef = useRef<HTMLElement | null>(null);
  const evalBarRef = useRef<HTMLElement | null>(null);
  const lastFinishedGameRef = useRef<string | null>(null);
  const deferredMoves = useDeferredValue(session.snapshot.moveList);
  const locale = session.settings.locale;
  const theme = getTheme(session.settings.themeId);
  const style = getThemeCssVariables(theme) as CSSProperties;
  const activeDifficulty = getDifficultyPreset(session.settings.difficultyId);
  const boardSession = analysisCursor === null ? session : deriveSessionAtPly(session, analysisCursor);
  const analysisMode = analysisCursor !== null;
  const currentPly = analysisCursor ?? session.moveEntries.length;
  const currentEvaluation = getEvaluationForPly(session.analysisSummary?.evaluationsByPly, currentPly);
  const autosaveTimestamp = autosave ? formatRelativeTimestamp(autosave.updatedAt, locale) : null;
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
  const isGameInProgress =
    session.moveEntries.length > 0 &&
    (session.snapshot.status === "active" || session.snapshot.status === "idle");
  const selectedDifficultyIndex = Math.max(
    0,
    difficultyPresets.findIndex((preset) => preset.id === newGameDifficultyId),
  );

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
    if (!booted || moveCount === 0 || moveCount <= prevMoveLengthRef.current) {
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

  useEffect(() => {
    const shell = appShellRef.current;
    if (!shell) {
      return;
    }

    const updateViewportPadding = () => {
      const nextPadding = measureViewportPadding(shell, [
        isZenMode ? null : topBarRef.current,
        isZenMode ? null : bottomBarRef.current,
        historyOpen ? historyPanelRef.current : null,
        analysisMode ? evalBarRef.current : null,
      ]);
      setViewportPadding((current) =>
        areViewportPaddingsEqual(current, nextPadding) ? current : nextPadding,
      );
    };

    updateViewportPadding();
    const frame = window.requestAnimationFrame(updateViewportPadding);
    window.addEventListener("resize", updateViewportPadding);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewportPadding);
    };
  }, [analysisMode, bottomBarExpanded, historyOpen, isZenMode, topBarExpanded]);

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
    if (isGameInProgress && !forceReplace) {
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
    <div className="app-shell" ref={appShellRef} style={style}>
      <div className="canvas-backdrop" />
      <div className="backdrop-orb backdrop-orb--primary" />
      <div className="backdrop-orb backdrop-orb--secondary" />
      <p className="app-title-badge">Pipo Chess 3D</p>

      <main className="stage-root">
        <ChessScene
          session={boardSession}
          theme={theme}
          interactionEnabled={!analysisMode}
          viewportPadding={viewportPadding}
          lastMove={boardLastMove}
          promotionAnchorSquare={pendingPromotion?.anchorSquare ?? null}
          selectedSquare={analysisMode ? null : selectedSquare}
          legalTargets={analysisMode ? [] : legalTargets}
          hintMove={analysisMode ? null : hintMove}
          onSquareSelect={(square) => {
            if (analysisMode) {
              return;
            }
            haptics.light();
            soundService.play("piece-select");
            void selectSquare(square);
          }}
          onPromotionAnchorChange={setPromotionAnchor}
        />
        {analysisMode ? (
          <EvalBar elementRef={evalBarRef} evaluation={currentEvaluation} locale={locale} />
        ) : null}
      </main>

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
        <span>{analysisMode ? t(locale, "history.analysis") : "PGN"}</span>
      </motion.button>

      <motion.section
        className={`top-bar ${topBarExpanded ? "is-expanded" : ""}`}
        ref={topBarRef}
        animate={{ opacity: isZenMode ? 0 : 1 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ pointerEvents: isZenMode ? "none" : undefined }}
      >
        <button
          className="bar-toggle"
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
        <ClockPill side={topSide} collapsed={!topBarExpanded} />
        <div className={`top-bar__meta ${topBarExpanded ? "is-visible" : ""}`}>
          <div className="top-bar__engine">
            <span className={`status-pill status-pill--${enginePhase}`}>{t(locale, getStatusKey(enginePhase))}</span>
            <strong>{activeDifficulty.label}</strong>
            <small>{engineMessage || t(locale, getStatusKey(enginePhase))}</small>
          </div>
        </div>
        <ClockPill side={bottomSide} collapsed={!topBarExpanded} />
      </motion.section>

      <motion.section
        className={`bottom-bar ${bottomBarExpanded ? "is-expanded" : ""}`}
        ref={bottomBarRef}
        animate={{ opacity: isZenMode ? 0 : 1 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{ pointerEvents: isZenMode ? "none" : undefined }}
      >
        <button
          className="bar-toggle"
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
        <ActionButton
          icon={isZenMode ? "◎" : "○"}
          label="Zen"
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
      </motion.section>

      <AnimatePresence>
        {historyOpen && (
          <motion.aside
            className="history-panel"
            ref={historyPanelRef}
            initial={{ x: "110%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "110%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            style={{ pointerEvents: "auto" }}
          >
            <div className="panel-header">
              <div>
                <p className="panel-kicker">{t(locale, "history.kicker")}</p>
                <h2>{t(locale, "hud.moves")}</h2>
              </div>
              <button
                className="ghost-icon-button"
                type="button"
                aria-label={t(locale, "panel.close")}
                onClick={() => setHistoryOpen(false)}
              >
                ×
              </button>
            </div>
            <MoveList
              moves={deferredMoves}
              locale={locale}
              selectedPly={analysisMode ? currentPly : null}
              onSelectPly={(ply) => {
                setAnalysisAutoplay(false);
                setAnalysisCursor(ply);
              }}
              tagsByPly={session.analysisSummary?.tagsByPly}
            />
          </motion.aside>
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
          <motion.section
            className="camera-picker"
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "110%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            style={{ pointerEvents: "auto" }}
          >
            <div className="panel-header">
              <div>
                <p className="panel-kicker">{t(locale, "camera.kicker")}</p>
                <h2>{t(locale, "hud.camera")}</h2>
              </div>
            </div>
            <div className="camera-grid">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  className={`camera-card ${cameraPreset === preset.id ? "is-selected" : ""}`}
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setCameraPreset(preset.id);
                    setCameraPickerOpen(false);
                  }}
                >
                  <span>{preset.icon}</span>
                  <strong>{t(locale, preset.labelKey)}</strong>
                </button>
              ))}
            </div>
          </motion.section>
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
        initial={{ y: "110%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "110%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 36 }}
        style={{ pointerEvents: "auto" }}
      >
        <div className="panel-header">
          <div>
            <p className="panel-kicker">{t(locale, "menu.kicker")}</p>
            <h2>{t(locale, "hud.menu")}</h2>
          </div>
          <button
            className="ghost-icon-button"
            type="button"
            aria-label={t(locale, "panel.close")}
            onClick={() => setMenuOpen(false)}
          >
            ×
          </button>
        </div>

        <MenuSection title={t(locale, "section.analysis.title")}>
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
          {analysisProgress ? (
            <p className="muted-copy">
              {t(locale, "section.analysis.subtitle.progress", {
                completed: analysisProgress.completed,
                total: analysisProgress.total,
              })}
            </p>
          ) : null}
          <AnalysisSummaryView summary={session.analysisSummary} locale={locale} />
        </MenuSection>

        <MenuSection title={t(locale, "menu.settings")}>
          <div className="settings-stack">
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

        <MenuSection title={t(locale, "section.library.title")}>
          {autosave ? (
            <article className="save-row">
              <div className="save-row__copy">
                <strong>{t(locale, "panel.saveLoad.autosave")}</strong>
                <span>{autosaveTimestamp}</span>
                <small>{buildSaveSummary(autosave.session, autosave.updatedAt, locale)}</small>
              </div>
              <div className="save-row__actions">
                {canResumeSession(autosave.session) ? (
                  <button className="ghost-button" type="button" onClick={() => void resumeSavedSession(restoreAutosave)}>
                    {t(locale, "save.restore")}
                  </button>
                ) : null}
                {canAnalyzeSession(autosave.session) ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void openSavedAnalysis(autosave.session, restoreAutosave)}
                  >
                    {t(locale, "analysis.open")}
                  </button>
                ) : null}
                <button className="ghost-button" type="button" onClick={() => void handleExportSession(autosave.session, "autosave")}>
                  {t(locale, "hud.export")}
                </button>
              </div>
            </article>
          ) : null}

          <div className="inline-actions">
            <button className="primary-button" type="button" onClick={() => void createManualSave()}>
              {t(locale, "panel.saveLoad.create")}
            </button>
            <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
              {t(locale, "hud.import")}
            </button>
            <button className="ghost-button" type="button" onClick={() => void handleExportSession(session)}>
              {t(locale, "hud.export")}
            </button>
          </div>

          <div className="save-list">
            {saveSlots.map((save) => (
              <article className="save-row" key={save.id}>
                <div className="save-row__copy">
                  <strong>{save.label}</strong>
                  <span>{formatRelativeTimestamp(save.updatedAt, locale)}</span>
                  <small>{buildSaveSummary(save.session, save.updatedAt, locale)}</small>
                </div>
                <div className="save-row__actions">
                  {canResumeSession(save.session) ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => void resumeSavedSession(() => loadManualSave(save.id!))}
                    >
                      {t(locale, "save.continue")}
                    </button>
                  ) : null}
                  {canAnalyzeSession(save.session) ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => void openSavedAnalysis(save.session, () => loadManualSave(save.id!))}
                    >
                      {t(locale, "analysis.open")}
                    </button>
                  ) : null}
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void handleExportSession(save.session, save.label)}
                  >
                    {t(locale, "hud.export")}
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void deleteManualSave(save.id!)}>
                    {t(locale, "panel.saveLoad.delete")}
                  </button>
                </div>
              </article>
            ))}
            {saveSlots.length === 0 ? <p className="muted-copy">{t(locale, "panel.saveLoad.empty")}</p> : null}
          </div>
        </MenuSection>
      </motion.aside>
        )}
      </AnimatePresence>

      {newGameOpen ? (
        <div
          className="overlay-scrim"
          aria-hidden="true"
          onClick={() => setNewGameOpen(false)}
        />
      ) : null}

      {newGameOpen ? (
        <section className="new-game-sheet is-open" role="dialog" aria-modal="true" aria-label={t(locale, "panel.newGame.title")}>
          <div className="sheet-handle" />
          <div className="panel-header panel-header--sheet">
            <div>
              <p className="panel-kicker">{t(locale, "newGame.kicker")}</p>
              <h2>{t(locale, "panel.newGame.title")}</h2>
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
        </section>
      ) : null}

      {pendingPromotion ? (
        <section
          className="promotion-popup"
          aria-label={t(locale, "promotion.title")}
          style={getPromotionPopupStyle(promotionAnchor)}
        >
          <p className="panel-kicker">{t(locale, "promotion.title")}</p>
          <div className="promotion-options">
            {PROMOTION_CHOICES.map((piece) => (
              <button
                className="promotion-option"
                key={piece}
                type="button"
                onClick={() => void confirmPromotion(piece)}
              >
                <span>{getPromotionGlyph(piece, session.playerColor)}</span>
                <small>{t(locale, getPromotionKey(piece))}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {replacePromptOpen ? (
        <>
          <div className="overlay-scrim overlay-scrim--strong" aria-hidden="true" />
          <section className="dialog-card">
            <h2>{t(locale, "confirm.newGame.title")}</h2>
            <p>{t(locale, "confirm.newGame.body")}</p>
            <div className="inline-actions">
              <button className="ghost-button" type="button" onClick={() => setReplacePromptOpen(false)}>
                {t(locale, "confirm.newGame.keep")}
              </button>
              <button className="ghost-button" type="button" onClick={() => { setReplacePromptOpen(false); setNewGameOpen(false); }}>
                {t(locale, "confirm.newGame.cancel")}
              </button>
              <button className="primary-button" type="button" onClick={() => void applyNewGame(true)}>
                {t(locale, "confirm.newGame.replace")}
              </button>
            </div>
          </section>
        </>
      ) : null}

      <AnimatePresence>
        {resultModalOpen && (
          <>
            <motion.div
              className="overlay-scrim overlay-scrim--strong"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            />
            <motion.section
              className="result-modal"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <p className="panel-kicker">{t(locale, "result.kicker")}</p>
              <h2>{t(locale, getFriendlyResultKey(session))}</h2>
              <p className="muted-copy">{t(locale, getResultStatusKey(session.snapshot.status))}</p>
              <div className="inline-actions">
                <button className="primary-button" type="button" onClick={() => void enterAnalysis()}>
                  {t(locale, "analysis.open")}
                </button>
                <button className="ghost-button" type="button" onClick={openNewGameSheet}>
                  {t(locale, "hud.newGame")}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setResultModalOpen(false);
                    setMenuOpen(true);
                  }}
                >
                  {t(locale, "hud.menu")}
                </button>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>

      {restoreNotice || transientNotice || transientError || lastError ? (
        <div className={`toast ${!restoreNotice && !transientNotice && (transientError || lastError) ? "is-error" : ""}`}>
          {restoreNotice ?? transientNotice ?? transientError ?? lastError}
        </div>
      ) : null}

      {!booted ? <div className="boot-scrim">{t(locale, "status.loading")}</div> : null}

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

interface ClockSideState {
  label: string;
  subtitle: string;
  time: number;
  active: boolean;
  thinking: boolean;
}

function ClockPill({ side, collapsed }: { side: ClockSideState; collapsed: boolean }) {
  return (
    <article className={`clock-pill ${side.active ? "is-active" : ""} ${collapsed ? "is-collapsed" : ""}`}>
      <div className="clock-pill__dot" aria-hidden="true" />
      <div className="clock-pill__copy">
        {!collapsed ? <span>{side.subtitle}</span> : null}
        <strong>{formatClock(side.time)}</strong>
        {!collapsed ? <small className={side.thinking ? "is-thinking" : ""}>{side.label}</small> : null}
      </div>
    </article>
  );
}

function ActionButton({
  icon,
  label,
  compact,
  disabled,
  loading,
  onClick,
}: {
  icon: string;
  label: string;
  compact: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`action-pill ${compact ? "is-compact" : ""}`}
      aria-label={label}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <span aria-hidden="true">{loading ? "…" : icon}</span>
      {!compact ? <strong>{label}</strong> : null}
    </button>
  );
}

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="menu-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ChipButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`chip-button ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      {children}
    </button>
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
      <strong>{label}</strong>
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

function measureViewportPadding(
  shell: HTMLElement,
  edgeElements: Array<HTMLElement | null>,
): ViewportPadding {
  const shellRect = shell.getBoundingClientRect();
  const padding = { ...EMPTY_VIEWPORT_PADDING };

  edgeElements.forEach((element) => {
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    if (
      rect.right <= shellRect.left ||
      rect.left >= shellRect.right ||
      rect.bottom <= shellRect.top ||
      rect.top >= shellRect.bottom
    ) {
      return;
    }

    if (rect.top - shellRect.top <= EDGE_CAPTURE_TOLERANCE_PX) {
      padding.top = Math.max(padding.top, rect.bottom - shellRect.top);
    }

    if (shellRect.bottom - rect.bottom <= EDGE_CAPTURE_TOLERANCE_PX) {
      padding.bottom = Math.max(padding.bottom, shellRect.bottom - rect.top);
    }

    if (rect.left - shellRect.left <= EDGE_CAPTURE_TOLERANCE_PX) {
      padding.left = Math.max(padding.left, rect.right - shellRect.left);
    }

    if (shellRect.right - rect.right <= EDGE_CAPTURE_TOLERANCE_PX) {
      padding.right = Math.max(padding.right, shellRect.right - rect.left);
    }
  });

  return padding;
}

function areViewportPaddingsEqual(a: ViewportPadding, b: ViewportPadding): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
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

function getPromotionPopupStyle(anchor: { x: number; y: number } | null): CSSProperties | undefined {
  if (!anchor) {
    return undefined;
  }

  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const clampedX = clamp(anchor.x, 88, Math.max(88, viewportWidth - 88));
  return {
    left: `${clampedX}px`,
    top: `${Math.max(24, anchor.y)}px`,
    transform: "translate(-50%, calc(-100% - 0.75rem))",
  };
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
