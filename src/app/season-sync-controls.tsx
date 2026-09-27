"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ImportDataset } from "@/domain/types";

import {
  datasetDefinitions,
  initialDatasetProgress,
  runDatasetBatch,
} from "./dataset-sync-client";

interface SeasonSyncControlsProps {
  year: number;
}

export function SeasonSyncControls({ year }: SeasonSyncControlsProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialDatasetProgress);
  const [running, setRunning] = useState(false);

  async function refresh(datasets: ImportDataset[]) {
    setRunning(true);
    const next = initialDatasetProgress();
    datasets.forEach((dataset) => {
      next[dataset] = "waiting";
    });
    setProgress(next);

    await runDatasetBatch(year, datasets, "refresh", (dataset, status) => {
      setProgress((current) => ({ ...current, [dataset]: status }));
      if (status === "succeeded") {
        router.refresh();
      }
    });
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="season-sync-controls">
      <button
        className="secondary"
        disabled={running}
        onClick={() =>
          void refresh(datasetDefinitions.map(({ id }) => id))
        }
        type="button"
      >
        Refresh all
      </button>
      <div className="dataset-refresh-buttons">
        {datasetDefinitions.map(({ id, label }) => (
          <button
            className="secondary"
            disabled={running}
            key={id}
            onClick={() => void refresh([id])}
            type="button"
          >
            {progress[id] === "running"
              ? `Syncing ${label.toLowerCase()}...`
              : `Refresh ${label.toLowerCase()}`}
          </button>
        ))}
      </div>
    </div>
  );
}
