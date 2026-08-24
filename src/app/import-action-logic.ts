import { SafeOperationalError } from "@/application/errors";
import type { SeasonImportService } from "@/application/services/season-import-service";

export interface ImportActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const initialImportActionState: ImportActionState = {
  status: "idle",
  message: "",
};

type ImportService = Pick<
  SeasonImportService,
  "importSeason" | "refreshSeason"
>;

function parseActionInput(formData: FormData) {
  const operation = formData.get("operation");
  const yearValue = formData.get("year");

  if (operation !== "import" && operation !== "refresh") {
    throw new SafeOperationalError(
      "Choose whether to import or refresh the season",
    );
  }

  if (typeof yearValue !== "string") {
    throw new SafeOperationalError("Choose a season year");
  }

  const year = Number(yearValue);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    String(year) !== yearValue
  ) {
    throw new SafeOperationalError("Choose a valid season year");
  }

  return { operation, year };
}

export async function executeImportAction(
  formData: FormData,
  getService: () => ImportService | Promise<ImportService>,
): Promise<ImportActionState> {
  try {
    const { operation, year } = parseActionInput(formData);
    const service = await getService();
    const importRun =
      operation === "import"
        ? await service.importSeason(year)
        : await service.refreshSeason(year);

    return {
      status: "success",
      message: `Season ${year} ${operation} succeeded (run ${importRun.id})`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The season operation failed unexpectedly",
    };
  }
}
