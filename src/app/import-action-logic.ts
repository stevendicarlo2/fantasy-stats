import { SafeOperationalError } from "@/application/errors";
import type {
  SeasonDataImportResult,
  SeasonDataImportService,
} from "@/application/services/season-data-import-service";
import type {
  ImportDataset,
  ImportOperation,
  ImportRunStatus,
} from "@/domain/types";

export interface ImportActionState {
  status: "idle" | "success" | "partial" | "error";
  message: string;
}

export const initialImportActionState: ImportActionState = {
  status: "idle",
  message: "",
};

type ImportService = Pick<
  SeasonDataImportService,
  | "syncSeason"
  | "syncDataset"
  | "retryPlayerStats"
  | "retryRosters"
  | "retryTransactions"
>;

export interface SeasonDatasetActionInput {
  dataset: ImportDataset;
  operation: ImportOperation;
  year: number;
}

export interface SeasonDatasetActionResult {
  dataset: ImportDataset;
  status: ImportRunStatus;
  message: string;
}

const importDatasets: ImportDataset[] = [
  "core",
  "rosters",
  "transactions",
  "player_stats",
];

export async function executeSeasonDatasetAction(
  input: SeasonDatasetActionInput,
  getService: () => ImportService | Promise<ImportService>,
): Promise<SeasonDatasetActionResult> {
  const { dataset, operation, year } = input;

  if (
    !importDatasets.includes(dataset) ||
    (operation !== "import" && operation !== "refresh") ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100
  ) {
    return {
      dataset,
      status: "failed",
      message: "Choose a valid season dataset operation",
    };
  }

  try {
    const service = await getService();
    const run = await service.syncDataset(year, dataset, operation);

    return {
      dataset,
      status: run.status,
      message:
        run.status === "unavailable"
          ? (run.errorMessage ?? `${dataset} is unavailable`)
          : `${dataset.replace("_", " ")} ${run.status}`,
    };
  } catch (error) {
    return {
      dataset,
      status: "failed",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The dataset sync failed unexpectedly",
    };
  }
}

function parseActionInput(formData: FormData) {
  const operation = formData.get("operation");
  const yearValue = formData.get("year");

  if (
    operation !== "sync" &&
    operation !== "retry-rosters" &&
    operation !== "retry-transactions" &&
    operation !== "retry-player-stats"
  ) {
    throw new SafeOperationalError(
      "Choose a valid season data operation",
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

function summarizeFullImport(
  year: number,
  result: SeasonDataImportResult,
): ImportActionState {
  const supplemental = [
    ["rosters", result.rosters],
    ["transactions", result.transactions],
    ["player stats", result.playerStats],
  ] as const;
  const failures = supplemental
    .filter(([, outcome]) => outcome.status === "rejected")
    .map(([dataset]) => dataset);

  return failures.length === 0
    ? {
        status: "success",
        message: `Season ${year} ${result.core.operation} succeeded`,
      }
    : {
        status: "partial",
        message: `Season ${year} core data succeeded, but ${failures.join(
          " and ",
        )} failed. Existing supplemental data was preserved.`,
      };
}

export async function executeImportAction(
  formData: FormData,
  getService: () => ImportService | Promise<ImportService>,
): Promise<ImportActionState> {
  try {
    const { operation, year } = parseActionInput(formData);
    const service = await getService();
    if (operation === "sync") {
      const result = await service.syncSeason(year);

      return summarizeFullImport(year, result);
    }

    const retry =
      operation === "retry-rosters"
        ? service.retryRosters(year)
        : operation === "retry-transactions"
          ? service.retryTransactions(year)
          : service.retryPlayerStats(year);
    const run = await retry;

    return {
      status: "success",
      message: `Season ${year} ${run.dataset?.replace("_", " ")} retry ${run.status}`,
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
