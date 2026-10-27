import { invoke } from "@tauri-apps/api/core";

export type SavedExperiment = {
  id: string;
  name: string;
  kind: string;
  description: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
};

type ExperimentInput = Pick<SavedExperiment, "name" | "kind" | "description" | "data">;

const LEGACY_KEY = "learning-blockchain-prototype-experiments";
const LEGACY_MIGRATED_KEY = "chain-v-experiments-migrated-to-sqlite";
let migrationInFlight: Promise<void> | null = null;

export async function listExperiments(): Promise<SavedExperiment[]> {
  const saved = await invoke<SavedExperiment[]>("list_experiments");
  await migrateLegacyExperiments(saved);
  return invoke<SavedExperiment[]>("list_experiments");
}

export const createExperiment = (experiment: ExperimentInput) =>
  invoke<SavedExperiment>("create_experiment", experiment);

export const updateExperiment = (experiment: SavedExperiment) =>
  invoke<SavedExperiment>("update_experiment", {
    id: experiment.id,
    name: experiment.name,
    kind: experiment.kind,
    description: experiment.description,
    data: experiment.data,
  });

export const deleteExperiment = (id: string) =>
  invoke<boolean>("delete_experiment", { id });

function migrateLegacyExperiments(saved: SavedExperiment[]) {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = migrateLegacyExperimentsOnce(saved).catch((reason: unknown) => {
    migrationInFlight = null;
    throw reason;
  });
  return migrationInFlight;
}

async function migrateLegacyExperimentsOnce(saved: SavedExperiment[]) {
  if (localStorage.getItem(LEGACY_MIGRATED_KEY) === "true") return;
  const encoded = localStorage.getItem(LEGACY_KEY);
  if (!encoded) {
    localStorage.setItem(LEGACY_MIGRATED_KEY, "true");
    return;
  }
  const parsed: unknown = JSON.parse(encoded);
  if (!Array.isArray(parsed)) {
    throw new Error("Old browser-stored experiment data is malformed and was not discarded.");
  }
  const legacy = parsed.filter(isLegacyExperiment);
  if (legacy.length !== parsed.length) {
    throw new Error("Some old experiment entries are invalid; existing browser data was preserved.");
  }
  const existingIds = new Set(saved.map((experiment) => experiment.id));
  const existingLegacyIds = new Set(saved.flatMap((experiment) => {
    if (typeof experiment.data !== "object" || experiment.data === null || !("legacyId" in experiment.data)) return [];
    return typeof experiment.data.legacyId === "string" ? [experiment.data.legacyId] : [];
  }));
  for (const experiment of legacy) {
    if (existingIds.has(experiment.id) || existingLegacyIds.has(experiment.id)) continue;
    await createExperiment({
      name: experiment.name,
      kind: experiment.kind,
      description: experiment.description,
      data: { legacyId: experiment.id },
    });
    existingLegacyIds.add(experiment.id);
  }
  localStorage.removeItem(LEGACY_KEY);
  localStorage.setItem(LEGACY_MIGRATED_KEY, "true");
}

function isLegacyExperiment(value: unknown): value is {
  id: string;
  name: string;
  kind: string;
  description: string;
  updatedAt: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value &&
    "kind" in value &&
    "description" in value &&
    "updatedAt" in value &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    typeof value.description === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isExperimentExport(value: unknown): value is {
  format: string;
  version: number;
  experiment: { name: string; kind: string; description: string; data?: unknown };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "format" in value &&
    (value.format === "chain-v-experiment" || value.format === "learning-blockchain-experiment-prototype") &&
    "version" in value &&
    (value.version === 1 || value.version === 2) &&
    "experiment" in value &&
    typeof value.experiment === "object" &&
    value.experiment !== null &&
    "name" in value.experiment &&
    "kind" in value.experiment &&
    "description" in value.experiment &&
    typeof value.experiment.name === "string" &&
    typeof value.experiment.kind === "string" &&
    typeof value.experiment.description === "string"
  );
}
