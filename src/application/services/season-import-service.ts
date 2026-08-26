import { randomUUID } from "node:crypto";

import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { FantasySource } from "@/application/ports/fantasy-source";
import type { ImportOperation, ImportRun } from "@/domain/types";

import { SafeOperationalError } from "../errors";

export interface SeasonImportServiceOptions {
  database: DatabaseProvider;
  source: FantasySource;
  createId?: () => string;
  now?: () => Date;
}

export class InvalidSeasonYearError extends SafeOperationalError {
  constructor(year: number) {
    super(`Season year ${year} must be an integer between 1900 and 2100`);
    this.name = "InvalidSeasonYearError";
  }
}

export class SeasonAlreadyImportedError extends SafeOperationalError {
  constructor(year: number) {
    super(`Season ${year} is already imported; use refreshSeason instead`);
    this.name = "SeasonAlreadyImportedError";
  }
}

export class SeasonNotImportedError extends SafeOperationalError {
  constructor(year: number) {
    super(`Season ${year} is not imported; use importSeason first`);
    this.name = "SeasonNotImportedError";
  }
}

function validateSeasonYear(year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new InvalidSeasonYearError(year);
  }
}

function safeAuditMessage(error: unknown) {
  if (error instanceof SafeOperationalError) {
    return `${error.name}: ${error.message}`;
  }

  return "Unexpected import failure";
}

export class SeasonImportService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: SeasonImportServiceOptions) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  importSeason(year: number): Promise<ImportRun> {
    return this.execute("import", year);
  }

  refreshSeason(year: number): Promise<ImportRun> {
    return this.execute("refresh", year);
  }

  private async execute(
    operation: ImportOperation,
    year: number,
  ): Promise<ImportRun> {
    validateSeasonYear(year);
    await this.assertOperationPrecondition(operation, year);

    const importRunId = this.createId();
    await this.options.database.startImportRun({
      id: importRunId,
      provider: this.options.source.provider,
      operation,
      seasonYear: year,
      startedAt: this.now().toISOString(),
    });

    try {
      const knownMappings = await this.options.database.listSourceMappings(
        this.options.source.provider,
      );
      const snapshot = await this.options.source.fetchSeason({
        year,
        knownMappings,
      });

      return await this.options.database.commitSeasonImport({
        importRunId,
        snapshot,
        completedAt: this.now().toISOString(),
      });
    } catch (operationError) {
      try {
        await this.options.database.failImportRun({
          importRunId,
          completedAt: this.now().toISOString(),
          errorMessage: safeAuditMessage(operationError),
        });
      } catch (auditError) {
        throw new AggregateError(
          [operationError, auditError],
          `Season ${year} ${operation} failed and its audit record could not be updated`,
        );
      }

      throw operationError;
    }
  }

  private async assertOperationPrecondition(
    operation: ImportOperation,
    year: number,
  ) {
    const existingSeason =
      await this.options.database.hasSeasonImport(year);

    if (operation === "import" && existingSeason) {
      throw new SeasonAlreadyImportedError(year);
    }

    if (operation === "refresh" && !existingSeason) {
      throw new SeasonNotImportedError(year);
    }
  }
}
