import { SafeOperationalError } from "@/application/errors";
import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { SeasonImportService } from "@/application/services/season-import-service";

export type SeasonCommandOperation = "import" | "refresh";

export interface SeasonCommand {
  operation: SeasonCommandOperation;
  year: number;
}

export interface SeasonCommandRuntime {
  database: Pick<DatabaseProvider, "runMigrations">;
  service: Pick<SeasonImportService, "importSeason" | "refreshSeason">;
  close(): void;
}

export interface SeasonCommandIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export class SeasonCommandUsageError extends SafeOperationalError {
  constructor(message: string) {
    super(message);
    this.name = "SeasonCommandUsageError";
  }
}

const usageMessage =
  "Usage: npm run import-season --year=<year> or npm run refresh-season --year=<year>";

export function resolveSeasonArguments(
  arguments_: string[],
  npmConfiguredYear: string | undefined,
) {
  if (
    npmConfiguredYear !== undefined &&
    arguments_.length === 1 &&
    (arguments_[0] === "import" || arguments_[0] === "refresh")
  ) {
    return [...arguments_, "--year", npmConfiguredYear];
  }

  return arguments_;
}

export function parseSeasonCommand(arguments_: string[]): SeasonCommand {
  const [operation, yearOption, yearValue, ...extraArguments] = arguments_;

  if (
    (operation !== "import" && operation !== "refresh") ||
    yearOption !== "--year" ||
    yearValue === undefined ||
    extraArguments.length > 0
  ) {
    throw new SeasonCommandUsageError(usageMessage);
  }

  const year = Number(yearValue);

  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    String(year) !== yearValue
  ) {
    throw new SeasonCommandUsageError(
      "Season year must be a four-digit integer between 1900 and 2100",
    );
  }

  return { operation, year };
}

function safeCliErrorMessage(error: unknown) {
  if (error instanceof SafeOperationalError) {
    return error.message;
  }

  return "Season command failed unexpectedly";
}

export async function runSeasonCli(
  arguments_: string[],
  createRuntime: () => SeasonCommandRuntime | Promise<SeasonCommandRuntime>,
  io: SeasonCommandIo,
): Promise<number> {
  let command: SeasonCommand;

  try {
    command = parseSeasonCommand(arguments_);
  } catch (error) {
    io.stderr(safeCliErrorMessage(error));
    return 2;
  }

  let runtime: SeasonCommandRuntime | undefined;

  try {
    runtime = await createRuntime();
    await runtime.database.runMigrations();
    const importRun =
      command.operation === "import"
        ? await runtime.service.importSeason(command.year)
        : await runtime.service.refreshSeason(command.year);

    io.stdout(
      `Season ${command.year} ${command.operation} succeeded (run ${importRun.id})`,
    );
    return 0;
  } catch (error) {
    io.stderr(safeCliErrorMessage(error));
    return 1;
  } finally {
    runtime?.close();
  }
}
