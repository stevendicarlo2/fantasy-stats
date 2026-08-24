"use server";

import { revalidatePath } from "next/cache";

import {
  executeImportAction,
  type ImportActionState,
} from "./import-action-logic";
import { getWebRuntime } from "@/server/runtime/web-runtime";

export async function runSeasonAction(
  _previousState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const result = await executeImportAction(formData, async () => {
    const runtime = await getWebRuntime();
    return runtime.importService;
  });

  if (result.status === "success") {
    revalidatePath("/");
  }

  return result;
}
