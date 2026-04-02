import { engineClient } from "../engine/EngineClient";
import { t } from "../i18n";
import type { EnginePhase, GameSession } from "../types/game";
import type { GameStoreGet, GameStoreSet, QualitySession } from "./gameStoreTypes";

let subscribedToEngine = false;
let activeAnalysisSignature: string | null = null;

function getAnalysisSignature(session: QualitySession): string {
  return session.snapshot.pgn;
}

export function startTrackedAnalysis(session: GameSession): string {
  const signature = getAnalysisSignature(session);
  activeAnalysisSignature = signature;
  return signature;
}

export function clearTrackedAnalysis(signature?: string): void {
  if (signature === undefined || activeAnalysisSignature === signature) {
    activeAnalysisSignature = null;
  }
}

export function isTrackedAnalysisSession(session: GameSession): boolean {
  return activeAnalysisSignature === getAnalysisSignature(session);
}

export function ensureEngineSubscription(set: GameStoreSet, get: GameStoreGet): void {
  if (subscribedToEngine) {
    return;
  }

  engineClient.subscribe((event) => {
    if (event.type === "status") {
      const phaseMap: Record<typeof event.phase, EnginePhase> = {
        loading: "booting",
        ready: "ready",
        thinking: "thinking",
        analyzing: "analyzing",
        error: "error",
      };

      set({
        enginePhase: phaseMap[event.phase],
        engineMessage: event.message ?? "",
      });
    }

    if (event.type === "analysisProgress") {
      if (!isTrackedAnalysisSession(get().session)) {
        return;
      }

      set({
        analysisProgress: {
          completed: event.completed,
          total: event.total,
          currentPly: event.currentPly,
        },
      });
    }
  });

  subscribedToEngine = true;
}

export async function ensureEngineReady(set: GameStoreSet, get: GameStoreGet): Promise<void> {
  await engineClient.init();
  const locale = get().session.settings.locale;
  set({
    enginePhase: "ready",
    engineMessage: t(locale, "engine.ready"),
    lastError: null,
  });
}

export async function interruptEngineWork(): Promise<void> {
  try {
    await engineClient.stop();
  } catch {
    // Ignore stop failures and let the caller continue with local state updates.
  }
}
