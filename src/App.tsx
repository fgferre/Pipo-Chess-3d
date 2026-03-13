import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Color } from "chess.js";
import { ChessScene } from "./components/ChessScene";
import { MoveList } from "./components/MoveList";
import { AnalysisSummaryView } from "./components/AnalysisSummaryView";
import { clockPresets } from "./data/clocks";
import { difficultyPresets, getDifficultyPreset } from "./data/difficulties";
import { getTheme, getThemeCssVariables, themes } from "./data/themes";
import { getLocaleLabel, t } from "./i18n";
import { locales } from "./i18n/dictionaries";
import { useGameStore } from "./state/gameStore";
import { formatClock, formatRelativeTimestamp } from "./utils/format";
import { readTextFile } from "./utils/files";
import type { Locale } from "./types/game";

type SectionId = "moves" | "analysis" | "library" | "game";

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
    analysisProgress,
    lastError,
    bootstrap,
    selectSquare,
    requestHint,
    undo,
    redo,
    newGame,
    setDifficulty,
    setTheme,
    setLocale,
    toggleOrientation,
    setClockConfig,
    createManualSave,
    loadManualSave,
    restoreAutosave,
    deleteManualSave,
    exportPgn,
    importPgnText,
    runAnalysis,
    persistCurrentAutosave,
    tickLiveClock,
  } = useGameStore();
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [customMinutes, setCustomMinutes] = useState("10");
  const [customIncrement, setCustomIncrement] = useState("5");
  const [transientError, setTransientError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedSectionRef = useRef(false);
  const deferredMoves = useDeferredValue(session.snapshot.moveList);
  const theme = getTheme(session.settings.themeId);
  const activeDifficulty = getDifficultyPreset(session.settings.difficultyId);
  const autosaveTimestamp = autosave
    ? formatRelativeTimestamp(autosave.updatedAt, session.settings.locale)
    : null;
  const topColor: Color = session.settings.orientation === "white" ? "b" : "w";
  const bottomColor: Color = session.settings.orientation === "white" ? "w" : "b";
  const lastMove = deferredMoves.at(-1);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setCustomMinutes(String(Math.max(0, Math.round(session.settings.clockConfig.baseMs / 60_000))));
    setCustomIncrement(String(Math.max(0, Math.round(session.settings.clockConfig.incrementMs / 1_000))));
  }, [session.settings.clockConfig.baseMs, session.settings.clockConfig.incrementMs]);

  useEffect(() => {
    if (initializedSectionRef.current || !booted) {
      return;
    }

    if (session.analysisSummary) {
      setOpenSection("analysis");
    } else if (session.snapshot.moveList.length > 0) {
      setOpenSection("moves");
    }

    initializedSectionRef.current = true;
  }, [booted, session.analysisSummary, session.snapshot.moveList.length]);

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

  const toggleSection = (section: SectionId) => {
    startTransition(() => {
      setOpenSection((current) => (current === section ? null : section));
    });
  };

  const revealSection = (section: SectionId) => {
    startTransition(() => {
      setOpenSection(section);
    });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);
      await importPgnText(text);
      revealSection("moves");
      setTransientError(null);
    } catch {
      setTransientError(t(session.settings.locale, "save.importError"));
    } finally {
      event.target.value = "";
    }
  };

  const applyCustomClock = async () => {
    const minutes = Number(customMinutes);
    const increment = Number(customIncrement);

    await setClockConfig({
      enabled: minutes > 0,
      label: minutes > 0 ? `${minutes} + ${increment}` : t(session.settings.locale, "clock.none"),
      baseMs: Math.max(0, minutes) * 60_000,
      incrementMs: Math.max(0, increment) * 1_000,
    });
    revealSection("game");
  };

  const style = getThemeCssVariables(theme) as CSSProperties;
  const statusKey =
    enginePhase === "booting"
      ? "status.loading"
      : enginePhase === "thinking"
        ? "status.thinking"
        : enginePhase === "analyzing"
          ? "status.analyzing"
          : enginePhase === "error"
            ? "status.error"
            : "status.ready";
  const resultKey =
    session.snapshot.status === "checkmate" ||
    session.snapshot.status === "stalemate" ||
    session.snapshot.status === "draw" ||
    session.snapshot.status === "threefold" ||
    session.snapshot.status === "insufficient" ||
    session.snapshot.status === "timeout"
      ? `result.${session.snapshot.status}`
      : "result.active";
  const movesSummary =
    deferredMoves.length === 0
      ? t(session.settings.locale, "section.moves.subtitle.empty")
      : t(session.settings.locale, "section.moves.subtitle.last", {
          count: deferredMoves.length,
          move: lastMove?.san ?? "—",
        });
  const analysisSummaryText = analysisProgress
    ? t(session.settings.locale, "section.analysis.subtitle.progress", {
        completed: analysisProgress.completed,
        total: analysisProgress.total,
      })
    : session.analysisSummary
      ? t(session.settings.locale, "section.analysis.subtitle.ready", {
          count: session.analysisSummary.criticalMoments.length,
        })
      : t(session.settings.locale, "section.analysis.subtitle.empty");
  const librarySummary =
    saveSlots.length > 0
      ? t(session.settings.locale, "section.library.subtitle.ready", {
          count: saveSlots.length,
        })
      : autosaveTimestamp
        ? t(session.settings.locale, "section.library.subtitle.autosave", {
            time: autosaveTimestamp,
          })
        : t(session.settings.locale, "section.library.subtitle.empty");
  const gameSummary = t(session.settings.locale, "section.game.subtitle", {
    difficulty: activeDifficulty.label,
    clock: session.settings.clockConfig.enabled ? session.settings.clockConfig.label : t(session.settings.locale, "clock.none"),
  });

  return (
    <div className="app-shell" style={style}>
      <div className="backdrop-orb backdrop-orb--primary" />
      <div className="backdrop-orb backdrop-orb--secondary" />

      <header className="app-header">
        <div className="brand-block">
          <p className="eyebrow">{t(session.settings.locale, "hud.offline")}</p>
          <div className="brand-row">
            <h1>{t(session.settings.locale, "app.title")}</h1>
            <span className={`status-pill status-pill--${enginePhase}`}>{t(session.settings.locale, statusKey)}</span>
          </div>
          <p className="brand-copy">{engineMessage || t(session.settings.locale, statusKey)}</p>
        </div>
        <span className="status-pill status-pill--result">{t(session.settings.locale, resultKey as never)}</span>
      </header>

      <main className="app-layout">
        <section className="play-stage">
          <ClockTray
            color={topColor}
            locale={session.settings.locale}
            isPlayer={topColor === session.playerColor}
            isActive={session.snapshot.clockState.activeColor === topColor}
            time={topColor === "w" ? session.snapshot.clockState.whiteMs : session.snapshot.clockState.blackMs}
          />

          <section className="board-card">
            <ChessScene
              session={session}
              theme={theme}
              selectedSquare={selectedSquare}
              legalTargets={legalTargets}
              hintMove={hintMove}
              onSquareSelect={(square) => {
                void selectSquare(square);
              }}
            />
          </section>

          <ClockTray
            color={bottomColor}
            locale={session.settings.locale}
            isPlayer={bottomColor === session.playerColor}
            isActive={session.snapshot.clockState.activeColor === bottomColor}
            time={bottomColor === "w" ? session.snapshot.clockState.whiteMs : session.snapshot.clockState.blackMs}
          />

          <section className="quick-actions" aria-label={t(session.settings.locale, "hud.primaryActions")}>
            <button className="primary-button" type="button" onClick={() => void requestHint()}>
              {t(session.settings.locale, "hud.hint")}
            </button>
            <button className="ghost-button" type="button" onClick={() => void undo()}>
              {t(session.settings.locale, "hud.undo")}
            </button>
            <button className="ghost-button" type="button" onClick={() => void redo()}>
              {t(session.settings.locale, "hud.redo")}
            </button>
            <button className="ghost-button" type="button" onClick={() => void toggleOrientation()}>
              {t(session.settings.locale, "hud.flip")}
            </button>
          </section>
        </section>

        <section className="detail-column">
          <AccordionSection
            title={t(session.settings.locale, "hud.moves")}
            summary={movesSummary}
            meta={deferredMoves.length > 0 ? <span className="section-badge">{deferredMoves.length}</span> : null}
            open={openSection === "moves"}
            onToggle={() => toggleSection("moves")}
          >
            <MoveList moves={deferredMoves} />
          </AccordionSection>

          <AccordionSection
            title={t(session.settings.locale, "section.analysis.title")}
            summary={analysisSummaryText}
            meta={
              analysisProgress ? (
                <span className="section-badge">
                  {analysisProgress.completed}/{analysisProgress.total}
                </span>
              ) : session.analysisSummary ? (
                <span className="section-badge">{session.analysisSummary.criticalMoments.length}</span>
              ) : null
            }
            open={openSection === "analysis"}
            onToggle={() => toggleSection("analysis")}
          >
            <div className="panel-stack">
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  revealSection("analysis");
                  void runAnalysis();
                }}
              >
                {t(session.settings.locale, "panel.analysis.run")}
              </button>
              <AnalysisSummaryView summary={session.analysisSummary} locale={session.settings.locale} />
            </div>
          </AccordionSection>

          <AccordionSection
            title={t(session.settings.locale, "section.library.title")}
            summary={librarySummary}
            meta={
              saveSlots.length > 0 ? (
                <span className="section-badge">{saveSlots.length}</span>
              ) : autosave ? (
                <span className="section-badge">A</span>
              ) : null
            }
            open={openSection === "library"}
            onToggle={() => toggleSection("library")}
          >
            <div className="panel-stack">
              {autosave ? (
                <article className="save-row">
                  <div>
                    <strong>{t(session.settings.locale, "panel.saveLoad.autosave")}</strong>
                    <span>{autosaveTimestamp}</span>
                  </div>
                  <div className="save-row__actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        revealSection("library");
                        void restoreAutosave();
                      }}
                    >
                      {t(session.settings.locale, "save.restore")}
                    </button>
                  </div>
                </article>
              ) : null}

              <div className="inline-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    revealSection("library");
                    void createManualSave();
                  }}
                >
                  {t(session.settings.locale, "panel.saveLoad.create")}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t(session.settings.locale, "hud.import")}
                </button>
                <button className="ghost-button" type="button" onClick={exportPgn}>
                  {t(session.settings.locale, "hud.export")}
                </button>
              </div>

              <div className="save-list">
                {saveSlots.map((save) => (
                  <article className="save-row" key={save.id}>
                    <div>
                      <strong>{save.label}</strong>
                      <span>{formatRelativeTimestamp(save.updatedAt, session.settings.locale)}</span>
                    </div>
                    <div className="save-row__actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          revealSection("library");
                          void loadManualSave(save.id!);
                        }}
                      >
                        {t(session.settings.locale, "panel.saveLoad.load")}
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          revealSection("library");
                          void deleteManualSave(save.id!);
                        }}
                      >
                        {t(session.settings.locale, "panel.saveLoad.delete")}
                      </button>
                    </div>
                  </article>
                ))}
                {saveSlots.length === 0 ? <p className="muted-copy">{t(session.settings.locale, "panel.saveLoad.empty")}</p> : null}
              </div>
            </div>
          </AccordionSection>

          <AccordionSection
            title={t(session.settings.locale, "section.game.title")}
            summary={gameSummary}
            open={openSection === "game"}
            onToggle={() => toggleSection("game")}
          >
            <div className="panel-stack">
              <div className="panel-stack">
                <p className="muted-copy">{t(session.settings.locale, "panel.newGame.body")}</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    void newGame();
                  }}
                >
                  {t(session.settings.locale, "panel.newGame.confirm")}
                </button>
              </div>

              <div className="settings-group">
                <div className="settings-group__header">
                  <h2>{t(session.settings.locale, "panel.difficulty.title")}</h2>
                </div>
                <div className="option-grid">
                  {difficultyPresets.map((difficulty) => (
                    <button
                      className={`option-card ${
                        session.settings.difficultyId === difficulty.id ? "is-selected" : ""
                      }`}
                      key={difficulty.id}
                      type="button"
                      onClick={() => {
                        revealSection("game");
                        void setDifficulty(difficulty.id);
                      }}
                    >
                      <strong>{difficulty.label}</strong>
                      <span>{difficulty.uciElo ? `Elo ${difficulty.uciElo}` : "Unlimited"}</span>
                      <small>{difficulty.moveTimeMs} ms</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <div className="settings-group__header">
                  <h2>{t(session.settings.locale, "panel.clock.title")}</h2>
                </div>
                <div className="option-grid">
                  {clockPresets.map((preset) => (
                    <button
                      className={`option-card ${
                        session.settings.clockConfig.label === preset.label ? "is-selected" : ""
                      }`}
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        revealSection("game");
                        void setClockConfig(preset);
                      }}
                    >
                      <strong>{preset.label}</strong>
                      <span>{preset.enabled ? "Tournament" : t(session.settings.locale, "clock.none")}</span>
                    </button>
                  ))}
                </div>
                <div className="custom-clock">
                  <label>
                    {t(session.settings.locale, "panel.clock.minutes")}
                    <input value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} />
                  </label>
                  <label>
                    {t(session.settings.locale, "panel.clock.increment")}
                    <input value={customIncrement} onChange={(event) => setCustomIncrement(event.target.value)} />
                  </label>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      void applyCustomClock();
                    }}
                  >
                    {t(session.settings.locale, "panel.clock.custom")}
                  </button>
                </div>
              </div>

              <div className="settings-group">
                <div className="settings-group__header">
                  <h2>{t(session.settings.locale, "panel.themes.title")}</h2>
                </div>
                <div className="option-grid">
                  {themes.map((option) => (
                    <button
                      className={`option-card ${session.settings.themeId === option.id ? "is-selected" : ""}`}
                      key={option.id}
                      type="button"
                      onClick={() => {
                        revealSection("game");
                        void setTheme(option.id);
                      }}
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
                <div className="settings-group__header">
                  <h2>{t(session.settings.locale, "panel.language.title")}</h2>
                </div>
                <div className="option-grid">
                  {locales.map((locale) => (
                    <button
                      className={`option-card ${session.settings.locale === locale ? "is-selected" : ""}`}
                      key={locale}
                      type="button"
                      onClick={() => {
                        revealSection("game");
                        void setLocale(locale);
                      }}
                    >
                      <strong>{getLocaleLabel(locale)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </AccordionSection>
        </section>
      </main>

      {!booted ? <div className="boot-scrim">{t(session.settings.locale, "status.loading")}</div> : null}
      {transientError || lastError ? <div className="toast">{transientError ?? lastError}</div> : null}
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

interface ClockTrayProps {
  color: Color;
  locale: Locale;
  isPlayer: boolean;
  isActive: boolean;
  time: number;
}

function ClockTray({ color, locale, isPlayer, isActive, time }: ClockTrayProps) {
  return (
    <article className={`clock-tray ${isActive ? "is-active" : ""}`}>
      <div className="clock-tray__identity">
        <span>{t(locale, color === "w" ? "hud.side.white" : "hud.side.black")}</span>
        <strong>{isPlayer ? t(locale, "hud.you") : t(locale, "hud.localAi")}</strong>
      </div>
      <time className="clock-tray__time">{formatClock(time)}</time>
    </article>
  );
}

interface AccordionSectionProps {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  meta?: ReactNode;
}

function AccordionSection({ title, summary, open, onToggle, children, meta }: AccordionSectionProps) {
  return (
    <section className={`section-card ${open ? "is-open" : ""}`}>
      <button
        className="section-card__header"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="section-card__copy">
          <span className="section-card__title">{title}</span>
          <strong>{summary}</strong>
        </div>
        <div className="section-card__meta">
          {meta}
          <span className="section-chevron" aria-hidden="true">
            {open ? "−" : "+"}
          </span>
        </div>
      </button>
      {open ? <div className="section-card__body">{children}</div> : null}
    </section>
  );
}

export default App;
