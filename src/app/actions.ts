"use server";

import { revalidatePath } from "next/cache";

import {
  executeAdjustmentAction,
  type AdjustmentActionState,
} from "./adjustment-action-logic";
import {
  executeSqlConsoleAction,
  executeSqlQueryAssistantAction,
  type SqlConsoleActionState,
} from "./sql-console-action-logic";
import { getWebRuntime } from "@/server/runtime/web-runtime";
import type {
  DataSyncView,
  DataSyncViewState,
} from "@/application/services/data-sync-coordinator";
import { SafeOperationalError } from "@/application/errors";
import type {
  ImportDataset,
  ImportRunStatus,
} from "@/domain/types";

export interface DatasetSyncHandle {
  dataset: ImportDataset;
  runId: string | null;
  status: ImportRunStatus | "missing";
  message: string;
  pollAfterMs: number | null;
}

export async function pollDataSyncView(
  seasonYear: number,
  view: DataSyncView,
): Promise<DataSyncViewState> {
  if (
    !Number.isInteger(seasonYear) ||
    seasonYear < 1900 ||
    seasonYear > 2100 ||
    !["season", "matchup", "adjustments"].includes(view)
  ) {
    throw new SafeOperationalError("Choose a valid synchronization view");
  }

  const runtime = await getWebRuntime();
  return runtime.dataSyncCoordinator.observeView(seasonYear, view);
}

export async function startSeasonDatasetSync(input: {
  year: number;
  dataset: ImportDataset;
  operation?: "import" | "refresh";
}): Promise<DatasetSyncHandle> {
  if (
    !Number.isInteger(input.year) ||
    input.year < 1900 ||
    input.year > 2100 ||
    !["core", "rosters", "transactions", "player_stats"].includes(
      input.dataset,
    ) ||
    (input.operation !== undefined &&
      input.operation !== "import" &&
      input.operation !== "refresh")
  ) {
    throw new SafeOperationalError("Choose a valid season dataset");
  }

  const runtime = await getWebRuntime();
  const result = await runtime.dataSyncCoordinator.requestDataset({
    ...input,
    trigger: "manual",
  });

  return {
    dataset: input.dataset,
    runId: result.run.id,
    status: result.run.status,
    message: result.started ? "Sync started" : "Sync already in progress",
    pollAfterMs: result.run.status === "running" ? 2_000 : null,
  };
}

export async function pollSeasonDatasetSync(
  importRunId: string,
): Promise<DatasetSyncHandle> {
  const runtime = await getWebRuntime();
  const run = await runtime.dataSyncCoordinator.getRun(importRunId);

  if (!run) {
    return {
      dataset: "core",
      runId: null,
      status: "missing",
      message: "The synchronization run could not be found",
      pollAfterMs: null,
    };
  }

  if (run.status !== "running") {
    revalidatePath("/");
    revalidatePath(`/seasons/${run.seasonYear}`);
  }

  return {
    dataset: run.dataset ?? "core",
    runId: run.id,
    status: run.status,
    message:
      run.status === "failed" || run.status === "unavailable"
        ? (run.errorMessage ?? `The ${run.dataset ?? "core"} sync failed`)
        : `${(run.dataset ?? "core").replace("_", " ")} ${run.status}`,
    pollAfterMs: run.status === "running" ? 2_000 : null,
  };
}

export async function runAdjustmentAction(
  _previousState: AdjustmentActionState,
  formData: FormData,
): Promise<AdjustmentActionState> {
  const result = await executeAdjustmentAction(formData, async () => {
    const runtime = await getWebRuntime();
    return runtime.matchupAdjustmentService;
  });

  if (result.status === "success" && result.seasonYear !== null) {
    revalidatePath(`/seasons/${result.seasonYear}`);
    revalidatePath(`/seasons/${result.seasonYear}/adjustments`);
  }

  return result;
}

export async function runSqlConsoleAction(
  _previousState: SqlConsoleActionState,
  formData: FormData,
): Promise<SqlConsoleActionState> {
  const operation = formData.get("operation");

  if (
    operation === "generate" ||
    operation === "generate-and-run"
  ) {
    return executeSqlQueryAssistantAction(
      formData,
      operation === "generate-and-run",
      async () => {
        const runtime = await getWebRuntime();
        return {
          assistant: runtime.sqlQueryAssistantService,
          console: runtime.sqlConsoleService,
        };
      },
    );
  }

  return executeSqlConsoleAction(formData, async () => {
    const runtime = await getWebRuntime();
    return runtime.sqlConsoleService;
  });
}
