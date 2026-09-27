"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ImportDataset } from "@/domain/types";

import {
  datasetDefinitions,
  runDatasetBatch,
} from "./dataset-sync-client";

interface SeasonSyncControlsProps {
  year: number;
}

export function SeasonSyncControls({ year }: SeasonSyncControlsProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function refresh(datasets: ImportDataset[]) {
    setRunning(true);

    await runDatasetBatch(year, datasets, "refresh", (dataset, status) => {
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
        disabled={running}
        onClick={() =>
          void refresh(datasetDefinitions.map(({ id }) => id))
        }
        type="button"
      >
        {running ? "Refreshing..." : "Refresh all"}
      </button>
    </div>
  );
}

interface DatasetSyncButtonProps {
  dataset: ImportDataset;
  label: string;
  year: number;
}

export function DatasetSyncButton({
  dataset,
  label,
  year,
}: DatasetSyncButtonProps) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function refresh() {
    setRunning(true);
    await runDatasetBatch(year, [dataset], "refresh", (_, status) => {
      if (status === "succeeded") {
        router.refresh();
      }
    });
    setRunning(false);
    router.refresh();
  }

  return (
    <button
      aria-label={`Refresh ${label.toLowerCase()}`}
      className={`dataset-refresh-button${running ? " running" : ""}`}
      disabled={running}
      onClick={() => void refresh()}
      title={`Refresh ${label.toLowerCase()}`}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 6v5h-5" />
        <path d="M19 11a7.5 7.5 0 1 0 .25 3" />
      </svg>
    </button>
  );
}
