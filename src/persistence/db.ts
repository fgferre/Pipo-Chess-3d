import Dexie, { type Table } from "dexie";
import type {
  AnalysisRecord,
  AppSettings,
  AutosaveRecord,
  GameSession,
  SaveSlotRecord,
} from "../types/game";

interface SettingsRow {
  key: "app";
  value: AppSettings;
}

interface AutosaveRow {
  key: "autosave";
  updatedAt: string;
  value: GameSession;
}

class PipoChessDb extends Dexie {
  settings!: Table<SettingsRow, SettingsRow["key"]>;
  autosave!: Table<AutosaveRow, AutosaveRow["key"]>;
  saves!: Table<SaveSlotRecord, number>;
  analyses!: Table<AnalysisRecord, number>;

  constructor() {
    super("pipo-chess-3d");
    this.version(1).stores({
      settings: "key",
      autosave: "key",
      saves: "++id, updatedAt",
      analyses: "++id, createdAt",
    });
  }
}

export const db = new PipoChessDb();

export async function loadBootstrapData(): Promise<{
  settings: AppSettings | null;
  autosave: AutosaveRecord | null;
  saves: SaveSlotRecord[];
}> {
  const [settingsRow, autosaveRow, saves] = await Promise.all([
    db.settings.get("app"),
    db.autosave.get("autosave"),
    db.saves.orderBy("updatedAt").reverse().toArray(),
  ]);

  return {
    settings: settingsRow?.value ?? null,
    autosave: autosaveRow
      ? {
          updatedAt: autosaveRow.updatedAt,
          session: autosaveRow.value,
        }
      : null,
    saves,
  };
}

export async function persistSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ key: "app", value: settings });
}

export async function persistAutosave(session: GameSession): Promise<AutosaveRecord> {
  const record: AutosaveRecord = {
    updatedAt: new Date().toISOString(),
    session,
  };
  await db.autosave.put({ key: "autosave", updatedAt: record.updatedAt, value: record.session });
  return record;
}

export async function clearAutosave(): Promise<void> {
  await db.autosave.delete("autosave");
}

export async function createSaveSlot(session: GameSession, label: string): Promise<SaveSlotRecord> {
  const now = new Date().toISOString();
  const record: SaveSlotRecord = {
    label,
    createdAt: now,
    updatedAt: now,
    session,
  };
  const id = await db.saves.add(record);
  return { ...record, id };
}

export async function loadSaveSlot(id: number): Promise<SaveSlotRecord | undefined> {
  return db.saves.get(id);
}

export async function deleteSaveSlot(id: number): Promise<void> {
  await db.saves.delete(id);
}

export async function listSaveSlots(): Promise<SaveSlotRecord[]> {
  return db.saves.orderBy("updatedAt").reverse().toArray();
}

export async function persistAnalysis(record: AnalysisRecord): Promise<AnalysisRecord> {
  const id = await db.analyses.add(record);
  return { ...record, id };
}
