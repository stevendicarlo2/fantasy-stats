"use server";

import { revalidatePath } from "next/cache";

import {
  executeAdjustmentAction,
  type AdjustmentActionState,
} from "./adjustment-action-logic";
import {
  executeImportAction,
  type ImportActionState,
} from "./import-action-logic";
import {
  executeSqlConsoleAction,
  executeSqlQueryAssistantAction,
  type SqlConsoleActionState,
} from "./sql-console-action-logic";
import { getWebRuntime } from "@/server/runtime/web-runtime";

export async function runSeasonAction(
  _previousState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const result = await executeImportAction(formData, async () => {
    const runtime = await getWebRuntime();
    return runtime.seasonDataImportService;
  });

  if (result.status === "success" || result.status === "partial") {
    revalidatePath("/");
  }

  return result;
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
