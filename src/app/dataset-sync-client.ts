"use client";

import type {
  ImportDataset,
  ImportOperation,
  ImportRunStatus,
} from "@/domain/types";

import {
  pollSeasonDatasetSync,
  startSeasonDatasetSync,
} from "./actions";

export type DatasetProgressStatus =
  | "idle"
  | "waiting"
  | "running"
  | "skipped"
  | ImportRunStatus;

export const datasetDefinitions = [
  { id: "core", label: "Core season data" },
  { id: "rosters", label: "Weekly rosters and projections" },
  { id: "transactions", label: "Draft picks and transactions" },
  { id: "player_stats", label: "NFL games and player statistics" },
] as const satisfies ReadonlyArray<{
  id: ImportDataset;
  label: string;
}>;

export function initialDatasetProgress(): Record<
  ImportDataset,
  DatasetProgressStatus
> {
  return {
    core: "idle",
    rosters: "idle",
    transactions: "idle",
    player_stats: "idle",
  };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runDataset(
  year: number,
  dataset: ImportDataset,
  operation: ImportOperation,
  onProgress: (dataset: ImportDataset, status: DatasetProgressStatus) => void,
) {
  onProgress(dataset, "running");
  let result = await startSeasonDatasetSync({ year, dataset, operation });

  while (result.status === "running" && result.runId) {
    await delay(result.pollAfterMs ?? 2_000);
    result = await pollSeasonDatasetSync(result.runId);
  }

  onProgress(dataset, result.status === "missing" ? "failed" : result.status);
  return { ...result, dataset };
}

const dependencies: Record<ImportDataset, ImportDataset[]> = {
  core: [],
  rosters: ["core"],
  transactions: ["core"],
  player_stats: ["core", "rosters"],
};

export async function runDatasetBatch(
  year: number,
  selected: ImportDataset[],
  operation: ImportOperation,
  onProgress: (dataset: ImportDataset, status: DatasetProgressStatus) => void,
) {
  const remaining = new Set(selected);
  const outcomes = new Map<ImportDataset, DatasetProgressStatus>();

  while (remaining.size > 0) {
    const blocked = [...remaining].filter((dataset) =>
      dependencies[dataset].some((dependency) => {
        const outcome = outcomes.get(dependency);
        return (
          outcome === "failed" ||
          outcome === "unavailable" ||
          outcome === "skipped"
        );
      }),
    );
    for (const dataset of blocked) {
      remaining.delete(dataset);
      outcomes.set(dataset, "skipped");
      onProgress(dataset, "skipped");
    }

    const ready = [...remaining].filter((dataset) =>
      dependencies[dataset].every(
        (dependency) =>
          !selected.includes(dependency) ||
          outcomes.get(dependency) === "succeeded",
      ),
    );

    if (ready.length === 0) {
      break;
    }

    for (const dataset of ready) {
      remaining.delete(dataset);
    }
    const results = await Promise.all(
      ready.map(async (dataset) => {
        try {
          return await runDataset(year, dataset, operation, onProgress);
        } catch {
          onProgress(dataset, "failed");
          return {
            dataset,
            status: "failed" as const,
          };
        }
      }),
    );
    results.forEach((result) => {
      outcomes.set(
        result.dataset,
        result.status === "missing" ? "failed" : result.status,
      );
    });
  }

  return outcomes;
}
