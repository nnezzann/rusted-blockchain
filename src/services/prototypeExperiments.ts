export type PrototypeExperiment = {
  id: string;
  name: string;
  kind: string;
  description: string;
  updatedAt: string;
};

const STORAGE_KEY = "learning-blockchain-prototype-experiments";

export function loadPrototypeExperiments(): {
  experiments: PrototypeExperiment[];
  error: string | null;
} {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return { experiments: [], error: null };
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { experiments: [], error: "Saved prototype data is not a valid experiment list." };
    }
    const experiments = parsed.filter(isPrototypeExperiment);
    if (experiments.length !== parsed.length) {
      return {
        experiments,
        error: "Some saved prototype entries were invalid and were not loaded.",
      };
    }
    return { experiments, error: null };
  } catch {
    return {
      experiments: [],
      error: "Could not read prototype experiments from this app profile.",
    };
  }
}

export function savePrototypeExperiments(experiments: PrototypeExperiment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
}

export function isPrototypeExperiment(value: unknown): value is PrototypeExperiment {
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
