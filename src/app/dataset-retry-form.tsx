"use client";

import { useActionState } from "react";

import type { ImportDataset } from "@/domain/types";

import { runSeasonAction } from "./actions";
import { initialImportActionState } from "./import-action-logic";

interface DatasetRetryFormProps {
  dataset: Exclude<ImportDataset, "core">;
  year: number;
}

const operationByDataset = {
  rosters: "retry-rosters",
  transactions: "retry-transactions",
  player_stats: "retry-player-stats",
} as const;

export function DatasetRetryForm({
  dataset,
  year,
}: DatasetRetryFormProps) {
  const [state, formAction, pending] = useActionState(
    runSeasonAction,
    initialImportActionState,
  );

  return (
    <form action={formAction} className="dataset-retry-form">
      <input type="hidden" name="year" value={year} />
      <input
        type="hidden"
        name="operation"
        value={operationByDataset[dataset]}
      />
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? "Retrying..." : "Retry"}
      </button>
      {state.message ? (
        <span className={`inline-action-message ${state.status}`}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
