"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { ImportDataset, ImportRunStatus } from "@/domain/types";

import {
  datasetDefinitions as datasets,
  initialDatasetProgress as initialProgress,
  runDatasetBatch,
} from "./dataset-sync-client";

interface ImportFormProps {
  importedYears: number[];
  years: number[];
}

type ProgressStatus =
  | "idle"
  | "waiting"
  | "running"
  | "skipped"
  | ImportRunStatus;

function progressLabel(
  status: ProgressStatus,
  selected: boolean,
  required: boolean,
) {
  if (status === "idle") {
    return required ? "required" : selected ? "selected" : "not selected";
  }

  if (status === "running") {
    return "syncing";
  }

  if (status === "succeeded") {
    return "complete";
  }

  return status;
}

export function ImportForm({ importedYears, years }: ImportFormProps) {
  const router = useRouter();
  const availableYears = years.filter(
    (candidate) => !importedYears.includes(candidate),
  );
  const [year, setYear] = useState(availableYears[0]);
  const [selected, setSelected] = useState<ImportDataset[]>(
    datasets.map(({ id }) => id),
  );
  const [progress, setProgress] = useState(initialProgress);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [datasetsExpanded, setDatasetsExpanded] = useState(false);
  const isNewSeason = true;
  const selectionSummary =
    selected.length === datasets.length
      ? "All datasets"
      : selected.length === 0
        ? "No datasets"
        : `${selected.length} of ${datasets.length} datasets`;

  function updateSelection(dataset: ImportDataset, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...new Set([...current, dataset])]
        : current.filter((candidate) => candidate !== dataset),
    );
  }

  function updateYear(nextYear: number) {
    setYear(nextYear);
    setMessage("");
    setProgress(initialProgress());

    if (!importedYears.includes(nextYear)) {
      setSelected((current) =>
        current.includes("core") ? current : ["core", ...current],
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selected.length === 0) {
      setMessage("Select at least one dataset to sync.");
      return;
    }

    const selectedSet = new Set(selected);
    const nextProgress = initialProgress();
    for (const { id } of datasets) {
      nextProgress[id] = selectedSet.has(id) ? "waiting" : "idle";
    }

    setProgress(nextProgress);
    setMessage("");
    setSyncing(true);
    setDatasetsExpanded(true);
    const outcomes = await runDatasetBatch(
      year,
      selected,
      "import",
      (dataset, status) =>
        setProgress((current) => ({ ...current, [dataset]: status })),
    );
    const failedDatasets = [...outcomes].filter(
      ([, status]) =>
        status === "failed" ||
        status === "unavailable" ||
        status === "skipped",
    );

    setMessage(
      failedDatasets.length === 0
        ? `Season ${year} sync completed.`
        : `Season ${year} sync completed with ${failedDatasets.length} failed dataset${failedDatasets.length === 1 ? "" : "s"}.`,
    );
    setSyncing(false);
    router.refresh();
  }

  if (availableYears.length === 0) {
    return <p>Every configured season has been imported.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="import-form">
      <label htmlFor="season-year">Season</label>
      <select
        id="season-year"
        name="year"
        value={year}
        onChange={(event) => updateYear(Number(event.target.value))}
        disabled={syncing}
        required
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <details
        className="sync-dataset-details"
        open={datasetsExpanded}
        onToggle={(event) =>
          setDatasetsExpanded(event.currentTarget.open)
        }
      >
        <summary>
          <span>Datasets</span>
          <strong>{selectionSummary}</strong>
        </summary>
        <div
          className="sync-dataset-picker"
          role="group"
          aria-label="Datasets"
          aria-live="polite"
        >
          {datasets.map(({ id, label }) => {
            const coreRequired = id === "core" && isNewSeason;

            return (
              <label key={id} className="sync-dataset-option">
                <span>
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={selected.includes(id)}
                    disabled={syncing || coreRequired}
                    onChange={(event) =>
                      updateSelection(id, event.target.checked)
                    }
                  />
                  {label}
                </span>
                <strong className={`sync-progress ${progress[id]}`}>
                  {progressLabel(
                    progress[id],
                    selected.includes(id),
                    coreRequired,
                  )}
                </strong>
              </label>
            );
          })}
          {isNewSeason ? (
            <p className="sync-note">
              Core data is required because this season has not been imported.
            </p>
          ) : null}
        </div>
      </details>
      <div className="button-row">
        <button type="submit" disabled={syncing || selected.length === 0}>
          {syncing ? "Syncing..." : "Sync selected datasets"}
        </button>
      </div>
      {message ? (
        <p className="action-message" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}
