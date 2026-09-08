"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import type { ImportDataset, ImportRunStatus } from "@/domain/types";

import { runSeasonDatasetAction } from "./actions";

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

const datasets = [
  { id: "core", label: "Core season data" },
  { id: "rosters", label: "Weekly rosters and projections" },
  { id: "transactions", label: "Draft picks and transactions" },
  { id: "player_stats", label: "NFL games and player statistics" },
] as const satisfies ReadonlyArray<{
  id: ImportDataset;
  label: string;
}>;

function initialProgress(): Record<ImportDataset, ProgressStatus> {
  return {
    core: "idle",
    rosters: "idle",
    transactions: "idle",
    player_stats: "idle",
  };
}

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
  const [year, setYear] = useState(years[0]);
  const [selected, setSelected] = useState<ImportDataset[]>(
    datasets.map(({ id }) => id),
  );
  const [progress, setProgress] = useState(initialProgress);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [datasetsExpanded, setDatasetsExpanded] = useState(false);
  const isNewSeason = !importedYears.includes(year);
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

    const operation = isNewSeason ? "import" : "refresh";
    const selectedSet = new Set(selected);
    const nextProgress = initialProgress();
    for (const { id } of datasets) {
      nextProgress[id] = selectedSet.has(id) ? "waiting" : "idle";
    }

    setProgress(nextProgress);
    setMessage("");
    setSyncing(true);
    setDatasetsExpanded(true);
    const failedDatasets: ImportDataset[] = [];

    for (const { id } of datasets) {
      if (!selectedSet.has(id)) {
        continue;
      }

      setProgress((current) => ({ ...current, [id]: "running" }));

      try {
        const result = await runSeasonDatasetAction({
          dataset: id,
          operation,
          year,
        });
        setProgress((current) => ({
          ...current,
          [id]: result.status,
        }));

        if (result.status === "failed") {
          failedDatasets.push(id);
          if (id === "core") {
            setProgress((current) => {
              const stopped = { ...current };
              for (const { id: remainingId } of datasets) {
                if (
                  selectedSet.has(remainingId) &&
                  stopped[remainingId] === "waiting"
                ) {
                  stopped[remainingId] = "skipped";
                }
              }
              return stopped;
            });
            break;
          }
        }
      } catch {
        failedDatasets.push(id);
        setProgress((current) => ({ ...current, [id]: "failed" }));
        if (id === "core") {
          setProgress((current) => {
            const stopped = { ...current };
            for (const { id: remainingId } of datasets) {
              if (
                selectedSet.has(remainingId) &&
                stopped[remainingId] === "waiting"
              ) {
                stopped[remainingId] = "skipped";
              }
            }
            return stopped;
          });
          break;
        }
      }
    }

    setMessage(
      failedDatasets.length === 0
        ? `Season ${year} sync completed.`
        : `Season ${year} sync completed with ${failedDatasets.length} failed dataset${failedDatasets.length === 1 ? "" : "s"}.`,
    );
    setSyncing(false);
    router.refresh();
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
        {years.map((year) => (
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
