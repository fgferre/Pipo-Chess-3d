import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { PanelId } from "./types/game";
import { ChessScene } from "./components/ChessScene";
import { MoveList } from "./components/MoveList";
import { PanelSheet } from "./components/PanelSheet";
import { AnalysisSummaryView } from "./components/AnalysisSummaryView";
import { clockPresets } from "./data/clocks";
import { difficultyPresets } from "./data/difficulties";
import { getTheme, getThemeCssVariables, themes } from "./data/themes";
import { getLocaleLabel, t } from "./i18n";
import { locales } from "./i18n/dictionaries";
import { useGameStore } from "./state/gameStore";
import { formatClock, formatRelativeTimestamp } from "./utils/format";
import { readTextFile } from "./utils/files";

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
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [customMinutes, setCustomMinutes] = useState("10");
  const [customIncrement, setCustomIncrement] = useState("5");
  const [transientError, setTransientError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deferredMoves = useDeferredValue(session.snapshot.moveList);
  const theme = getTheme(session.settings.themeId);
  const closePanel = () => setActivePanel(null);
  const autosaveTimestamp = autosave
    ? formatRelativeTimestamp(autosave.updatedAt, session.settings.locale)
    : null;

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setCustomMinutes(String(Math.max(0, Math.round(session.settings.clockConfig.baseMs / 60_000))));
    setCustomIncrement(String(Math.max(0, Math.round(session.settings.clockConfig.incrementMs / 1_000))));
  }, [session.settings.clockConfig.baseMs, session.settings.clockConfig.incrementMs]);

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

  const togglePanel = (panel: PanelId) => {
    startTransition(() => {
      setActivePanel((current) => (current === panel ? null : panel));
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
  };

  const runPanelAction = async (action: () => Promise<void>) => {
    await action();
    closePanel();
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

  return (
    <div className="app-shell" style={style}>
      <div className="backdrop-orb backdrop-orb--primary" />
      <div className="backdrop-orb backdrop-orb--secondary" />

      <header className="hero">
        <div>
          <p className="eyebrow">{t(session.settings.locale, "hud.offline")}</p>
          <h1>{t(session.settings.locale, "app.title")}</h1>
          <p className="hero-copy">{t(session.settings.locale, "app.subtitle")}</p>
        </div>
        <div className="hero-badges">
          <span className={`status-pill status-pill--${enginePhase}`}>{t(session.settings.locale, statusKey)}</span>
          <span className="status-pill status-pill--result">{t(session.settings.locale, resultKey as never)}</span>
        </div>
      </header>

      <main className="app-layout">
        <section className="play-column">
          <article className="hero-stats">
            <div className="stat-card">
              <span>{t(session.settings.locale, "hud.engine")}</span>
              <strong>{engineMessage || t(session.settings.locale, statusKey)}</strong>
            </div>
            <div className="stat-card">
              <span>{t(session.settings.locale, "hud.turn.white")}</span>
              <strong>{formatClock(session.snapshot.clockState.whiteMs)}</strong>
            </div>
            <div className="stat-card">
              <span>{t(session.settings.locale, "hud.turn.black")}</span>
              <strong>{formatClock(session.snapshot.clockState.blackMs)}</strong>
            </div>
          </article>

          <section className="board-card">
            <div className="board-overlays">
              <div
                className={`clock-banner ${session.snapshot.clockState.activeColor === "b" ? "is-active" : ""}`}
              >
                <span>Black</span>
                <strong>{formatClock(session.snapshot.clockState.blackMs)}</strong>
              </div>
              <div
                className={`clock-banner ${session.snapshot.clockState.activeColor === "w" ? "is-active" : ""}`}
              >
                <span>White</span>
                <strong>{formatClock(session.snapshot.clockState.whiteMs)}</strong>
              </div>
            </div>

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

          <section className="quick-actions">
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
            <button className="ghost-button" type="button" onClick={() => fileInputRef.current?.click()}>
              {t(session.settings.locale, "hud.import")}
            </button>
            <button className="ghost-button" type="button" onClick={exportPgn}>
              {t(session.settings.locale, "hud.export")}
            </button>
            <button className="ghost-button" type="button" onClick={() => void newGame()}>
              {t(session.settings.locale, "hud.newGame")}
            </button>
          </section>
        </section>

        <aside className="info-column">
          <article className="side-card">
            <div className="side-card__header">
              <h2>{t(session.settings.locale, "hud.moves")}</h2>
              <span>{deferredMoves.length}</span>
            </div>
            <MoveList moves={deferredMoves} />
          </article>

          <article className="side-card">
            <div className="side-card__header">
              <h2>{t(session.settings.locale, "hud.analysis")}</h2>
              {analysisProgress ? (
                <span>
                  {analysisProgress.completed}/{analysisProgress.total}
                </span>
              ) : null}
            </div>
            <AnalysisSummaryView summary={session.analysisSummary} locale={session.settings.locale} />
          </article>

          <article className="side-card">
            <div className="side-card__header">
              <h2>{t(session.settings.locale, "nav.saveLoad")}</h2>
            </div>
            <div className="save-grid">
              {saveSlots.slice(0, 4).map((save) => (
                <button
                  className="save-tile"
                  key={save.id}
                  type="button"
                  onClick={() => void loadManualSave(save.id!)}
                >
                  <strong>{save.label}</strong>
                  <span>{formatRelativeTimestamp(save.updatedAt, session.settings.locale)}</span>
                </button>
              ))}
              {saveSlots.length === 0 ? <p className="muted-copy">{t(session.settings.locale, "panel.saveLoad.empty")}</p> : null}
            </div>
          </article>
        </aside>
      </main>

      <nav className="bottom-dock">
        <button type="button" onClick={() => togglePanel("new-game")}>
          {t(session.settings.locale, "nav.newGame")}
        </button>
        <button type="button" onClick={() => togglePanel("difficulty")}>
          {t(session.settings.locale, "nav.difficulty")}
        </button>
        <button type="button" onClick={() => togglePanel("clock")}>
          {t(session.settings.locale, "nav.clock")}
        </button>
        <button type="button" onClick={() => togglePanel("themes")}>
          {t(session.settings.locale, "nav.themes")}
        </button>
        <button type="button" onClick={() => togglePanel("save-load")}>
          {t(session.settings.locale, "nav.saveLoad")}
        </button>
        <button type="button" onClick={() => togglePanel("analysis")}>
          {t(session.settings.locale, "nav.analysis")}
        </button>
        <button type="button" onClick={() => togglePanel("language")}>
          {t(session.settings.locale, "nav.language")}
        </button>
      </nav>

      <PanelSheet
        title={panelTitle(activePanel, session.settings.locale)}
        visible={activePanel !== null}
        closeLabel={t(session.settings.locale, "panel.close")}
        onClose={closePanel}
      >
        {activePanel === "new-game" ? (
          <div className="panel-stack">
            <p>{t(session.settings.locale, "panel.newGame.body")}</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void runPanelAction(newGame);
              }}
            >
              {t(session.settings.locale, "panel.newGame.confirm")}
            </button>
          </div>
        ) : null}

        {activePanel === "difficulty" ? (
          <div className="option-grid">
            {difficultyPresets.map((difficulty) => (
              <button
                className={`option-card ${
                  session.settings.difficultyId === difficulty.id ? "is-selected" : ""
                }`}
                key={difficulty.id}
                type="button"
                onClick={() => {
                  void runPanelAction(() => setDifficulty(difficulty.id));
                }}
              >
                <strong>{difficulty.label}</strong>
                <span>
                  {difficulty.uciElo ? `Elo ${difficulty.uciElo}` : "Unlimited"}
                </span>
                <small>{difficulty.moveTimeMs} ms</small>
              </button>
            ))}
          </div>
        ) : null}

        {activePanel === "clock" ? (
          <div className="panel-stack">
            <div className="option-grid">
              {clockPresets.map((preset) => (
                <button
                  className={`option-card ${
                    session.settings.clockConfig.label === preset.label ? "is-selected" : ""
                  }`}
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    void runPanelAction(() => setClockConfig(preset));
                  }}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.enabled ? "Tournament" : t(session.settings.locale, "clock.none")}</span>
                </button>
              ))}
            </div>
            <div className="custom-clock">
              <label>
                Minutes
                <input value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} />
              </label>
              <label>
                Increment
                <input value={customIncrement} onChange={(event) => setCustomIncrement(event.target.value)} />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  void runPanelAction(applyCustomClock);
                }}
              >
                {t(session.settings.locale, "panel.clock.custom")}
              </button>
            </div>
          </div>
        ) : null}

        {activePanel === "themes" ? (
          <div className="option-grid">
            {themes.map((option) => (
              <button
                className={`option-card ${session.settings.themeId === option.id ? "is-selected" : ""}`}
                key={option.id}
                type="button"
                onClick={() => {
                  void runPanelAction(() => setTheme(option.id));
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
        ) : null}

        {activePanel === "save-load" ? (
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
                      void runPanelAction(restoreAutosave);
                    }}
                  >
                    {t(session.settings.locale, "save.restore")}
                  </button>
                </div>
              </article>
            ) : null}
            <button className="primary-button" type="button" onClick={() => void createManualSave()}>
              {t(session.settings.locale, "panel.saveLoad.create")}
            </button>
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
                        void runPanelAction(() => loadManualSave(save.id!));
                      }}
                    >
                      {t(session.settings.locale, "panel.saveLoad.load")}
                    </button>
                    <button className="ghost-button" type="button" onClick={() => void deleteManualSave(save.id!)}>
                      {t(session.settings.locale, "panel.saveLoad.delete")}
                    </button>
                  </div>
                </article>
              ))}
              {saveSlots.length === 0 ? <p className="muted-copy">{t(session.settings.locale, "panel.saveLoad.empty")}</p> : null}
            </div>
          </div>
        ) : null}

        {activePanel === "analysis" ? (
          <div className="panel-stack">
            <button className="primary-button" type="button" onClick={() => void runAnalysis()}>
              {t(session.settings.locale, "panel.analysis.run")}
            </button>
            <AnalysisSummaryView summary={session.analysisSummary} locale={session.settings.locale} />
          </div>
        ) : null}

        {activePanel === "language" ? (
          <div className="option-grid">
            {locales.map((locale) => (
              <button
                className={`option-card ${session.settings.locale === locale ? "is-selected" : ""}`}
                key={locale}
                type="button"
                onClick={() => {
                  void runPanelAction(() => setLocale(locale));
                }}
              >
                <strong>{getLocaleLabel(locale)}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </PanelSheet>

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

function panelTitle(panel: PanelId | null, locale: "pt-BR" | "en"): string {
  switch (panel) {
    case "new-game":
      return t(locale, "panel.newGame.title");
    case "difficulty":
      return t(locale, "panel.difficulty.title");
    case "clock":
      return t(locale, "panel.clock.title");
    case "themes":
      return t(locale, "panel.themes.title");
    case "save-load":
      return t(locale, "panel.saveLoad.title");
    case "analysis":
      return t(locale, "panel.analysis.title");
    case "language":
      return t(locale, "panel.language.title");
    default:
      return "";
  }
}

export default App;
