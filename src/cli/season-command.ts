import { SafeOperationalError } from "@/application/errors";
import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { SeasonImportService } from "@/application/services/season-import-service";
import type { StorageKind } from "@/server/storage/storage-provider";

export type SeasonCommandOperation = "import" | "refresh";

export interface SeasonCommand {
  operation: SeasonCommandOperation;
  year: number;
  storage: StorageKind;
  databaseFile?: string;
}

export interface SeasonCommandRuntime {
  storageKind: StorageKind;
  persistent: boolean;
  database: Pick<
    DatabaseProvider,
    "runMigrations" | "getSeasonImportSnapshot"
  >;
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
  "Usage: npm run import-season --year=<year> [--storage=dummy|local|turso] [--database-file=<path>]";

export interface SeasonArgumentConfiguration {
  year?: string;
  storage?: string;
  databaseFile?: string;
}

export function resolveSeasonArguments(
  arguments_: string[],
  configuration: SeasonArgumentConfiguration,
) {
  const resolved = [...arguments_];

  for (const [option, value] of [
    ["--year", configuration.year],
    ["--storage", configuration.storage],
    ["--database-file", configuration.databaseFile],
  ] as const) {
    if (value !== undefined && !resolved.includes(option)) {
      resolved.push(option, value);
    }
  }

  return resolved;
}

export function parseSeasonCommand(arguments_: string[]): SeasonCommand {
  const [operation, ...optionArguments] = arguments_;

  if (operation !== "import" && operation !== "refresh") {
    throw new SeasonCommandUsageError(usageMessage);
  }

  const options = new Map<string, string>();

  for (let index = 0; index < optionArguments.length; index += 2) {
    const option = optionArguments[index];
    const value = optionArguments[index + 1];

    if (
      value === undefined ||
      !["--year", "--storage", "--database-file"].includes(option) ||
      options.has(option)
    ) {
      throw new SeasonCommandUsageError(usageMessage);
    }

    options.set(option, value);
  }

  const yearValue = options.get("--year");

  if (yearValue === undefined) {
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

  const storage = options.get("--storage") ?? "dummy";

  if (!["dummy", "local", "turso"].includes(storage)) {
    throw new SeasonCommandUsageError(
      "Storage must be one of: dummy, local, turso",
    );
  }

  const databaseFile = options.get("--database-file");

  if (databaseFile !== undefined && storage !== "local") {
    throw new SeasonCommandUsageError(
      "--database-file can only be used with --storage=local",
    );
  }

  return {
    operation,
    year,
    storage: storage as StorageKind,
    databaseFile:
      storage === "local"
        ? (databaseFile ?? ".data/fantasy-stats.db")
        : undefined,
  };
}

function safeCliErrorMessage(error: unknown) {
  if (error instanceof SafeOperationalError) {
    return error.message;
  }

  return "Season command failed unexpectedly";
}

export async function runSeasonCli(
  arguments_: string[],
  createRuntime: (
    command: SeasonCommand,
  ) => SeasonCommandRuntime | Promise<SeasonCommandRuntime>,
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
    runtime = await createRuntime(command);
    await runtime.database.runMigrations();
    const importRun =
      command.operation === "import"
        ? await runtime.service.importSeason(command.year)
        : await runtime.service.refreshSeason(command.year);
    const snapshot = await runtime.database.getSeasonImportSnapshot(
      command.year,
    );

    if (!snapshot) {
      throw new SafeOperationalError(
        `Storage did not return season ${command.year} after a successful import`,
      );
    }

    io.stdout(
      [
        `Season ${command.year} ${command.operation} succeeded using ${runtime.storageKind} storage`,
        `${snapshot.franchises.length} franchises`,
        `${snapshot.matchups.length} matchups`,
        `${snapshot.scores.length} scores`,
        runtime.persistent ? "persisted" : "not persisted",
        `run ${importRun.id}`,
      ].join("; "),
    );
    return 0;
  } catch (error) {
    io.stderr(safeCliErrorMessage(error));
    return 1;
  } finally {
    runtime?.close();
  }
}
