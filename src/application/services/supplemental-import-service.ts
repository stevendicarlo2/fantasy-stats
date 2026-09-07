import { randomUUID } from "node:crypto";

import type { DatabaseProvider } from "@/application/ports/database-provider";
import type {
  FantasyRosterSource,
  FantasyTransactionSource,
} from "@/application/ports/fantasy-source";
import type { NflSource } from "@/application/ports/nfl-source";
import type {
  ImportDataset,
  ImportOperation,
  ImportRun,
} from "@/domain/types";

import { SafeOperationalError } from "../errors";

type SupplementalDatabase = Pick<
  DatabaseProvider,
  | "commitPlayerStatsImport"
  | "commitRosterImport"
  | "commitTransactionImport"
  | "failImportRun"
  | "getSeasonImportSnapshot"
  | "listRelevantPlayers"
  | "listSourceMappings"
  | "markImportUnavailable"
  | "startImportRun"
>;

export interface SupplementalImportServiceOptions {
  database: SupplementalDatabase;
  rosterSource: FantasyRosterSource;
  transactionSource: FantasyTransactionSource;
  nflSource: NflSource;
  createId?: () => string;
  now?: () => Date;
}

export class SupplementalSeasonMissingError extends SafeOperationalError {
  constructor(year: number) {
    super(`Season ${year} must be imported before supplemental data`);
    this.name = "SupplementalSeasonMissingError";
  }
}

function safeAuditMessage(error: unknown) {
  return error instanceof SafeOperationalError
    ? `${error.name}: ${error.message}`
    : "Unexpected import failure";
}

export class SupplementalImportService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: SupplementalImportServiceOptions) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  importRosters(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute(
      "rosters",
      operation,
      year,
      async (importRunId, completedAt) => {
        const knownMappings =
          await this.options.database.listSourceMappings(
            this.options.rosterSource.provider,
          );
        const result = await this.options.rosterSource.fetchRosters({
          year,
          knownMappings,
        });

        if (result.availability === "unavailable") {
          return this.options.database.markImportUnavailable({
            importRunId,
            completedAt,
            reason: result.reason,
          });
        }

        return this.options.database.commitRosterImport({
          importRunId,
          snapshot: result.snapshot,
          completedAt,
        });
      },
    );
  }

  importTransactions(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute(
      "transactions",
      operation,
      year,
      async (importRunId, completedAt) => {
        const knownMappings =
          await this.options.database.listSourceMappings(
            this.options.transactionSource.provider,
          );
        const result =
          await this.options.transactionSource.fetchTransactions({
            year,
            knownMappings,
          });

        if (result.availability === "unavailable") {
          return this.options.database.markImportUnavailable({
            importRunId,
            completedAt,
            reason: result.reason,
          });
        }

        return this.options.database.commitTransactionImport({
          importRunId,
          snapshot: result.snapshot,
          completedAt,
        });
      },
    );
  }

  importPlayerStats(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute(
      "player_stats",
      operation,
      year,
      async (importRunId, completedAt) => {
        if (year < 2018) {
          return this.options.database.markImportUnavailable({
            importRunId,
            completedAt,
            reason:
              "Fantasy-relevant player history is unavailable before 2018",
          });
        }

        const [core, relevantPlayers, knownMappings] = await Promise.all([
          this.requireCoreSeason(year),
          this.options.database.listRelevantPlayers(year),
          this.options.database.listSourceMappings(
            this.options.nflSource.provider,
          ),
        ]);
        const scoringPeriods = [
          ...new Set(
            (
              core.matchupScoringPeriods ??
              core.matchups.map((matchup) => ({
                matchupId: matchup.id,
                scoringPeriod: matchup.week,
              }))
            ).map((period) => period.scoringPeriod),
          ),
        ];
        const snapshot = await this.options.nflSource.fetchPlayerStats({
          year,
          scoringPeriods,
          relevantPlayers,
          knownMappings,
        });

        return this.options.database.commitPlayerStatsImport({
          importRunId,
          snapshot,
          completedAt,
        });
      },
    );
  }

  private async execute(
    dataset: Exclude<ImportDataset, "core">,
    operation: ImportOperation,
    year: number,
    commit: (
      importRunId: string,
      completedAt: string,
    ) => Promise<ImportRun>,
  ) {
    await this.requireCoreSeason(year);
    const importRunId = this.createId();
    const provider =
      dataset === "player_stats"
        ? this.options.nflSource.provider
        : dataset === "transactions"
          ? this.options.transactionSource.provider
          : this.options.rosterSource.provider;
    await this.options.database.startImportRun({
      id: importRunId,
      provider,
      operation,
      dataset,
      seasonYear: year,
      startedAt: this.now().toISOString(),
    });

    try {
      return await commit(importRunId, this.now().toISOString());
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
          `Season ${year} ${dataset} import failed and its audit record could not be updated`,
        );
      }

      throw operationError;
    }
  }

  private async requireCoreSeason(year: number) {
    const snapshot =
      await this.options.database.getSeasonImportSnapshot(year);

    if (!snapshot) {
      throw new SupplementalSeasonMissingError(year);
    }

    return snapshot;
  }
}
