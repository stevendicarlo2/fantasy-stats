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

  providerForDataset(dataset: Exclude<ImportDataset, "core">) {
    return dataset === "player_stats"
      ? this.options.nflSource.provider
      : dataset === "transactions"
        ? this.options.transactionSource.provider
        : this.options.rosterSource.provider;
  }

  importRosters(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute("rosters", operation, year);
  }

  importTransactions(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute("transactions", operation, year);
  }

  importPlayerStats(
    year: number,
    operation: ImportOperation = "refresh",
  ): Promise<ImportRun> {
    return this.execute("player_stats", operation, year);
  }

  private async execute(
    dataset: Exclude<ImportDataset, "core">,
    operation: ImportOperation,
    year: number,
  ) {
    await this.requireCoreSeason(year);
    const importRunId = this.createId();
    const provider =
      dataset === "player_stats"
        ? this.options.nflSource.provider
        : dataset === "transactions"
          ? this.options.transactionSource.provider
          : this.options.rosterSource.provider;
    const run = await this.options.database.startImportRun({
      id: importRunId,
      provider,
      operation,
      trigger: "manual",
      dataset,
      seasonYear: year,
      startedAt: this.now().toISOString(),
    });

    return this.executeStartedRun(run);
  }

  async prepareDataset(year: number) {
    await this.requireCoreSeason(year);
  }

  async executeStartedRun(run: ImportRun | null): Promise<ImportRun> {
    if (
      !run ||
      run.status !== "running" ||
      run.dataset === undefined ||
      run.dataset === "core"
    ) {
      throw new SafeOperationalError(
        "A running supplemental import is required",
      );
    }

    const commit =
      run.dataset === "rosters"
        ? async (completedAt: string) => {
            const knownMappings =
              await this.options.database.listSourceMappings(
                this.options.rosterSource.provider,
              );
            const result = await this.options.rosterSource.fetchRosters({
              year: run.seasonYear,
              knownMappings,
            });
            return result.availability === "unavailable"
              ? this.options.database.markImportUnavailable({
                  importRunId: run.id,
                  completedAt,
                  reason: result.reason,
                })
              : this.options.database.commitRosterImport({
                  importRunId: run.id,
                  snapshot: result.snapshot,
                  completedAt,
                });
          }
        : run.dataset === "transactions"
          ? async (completedAt: string) => {
              const knownMappings =
                await this.options.database.listSourceMappings(
                  this.options.transactionSource.provider,
                );
              const result =
                await this.options.transactionSource.fetchTransactions({
                  year: run.seasonYear,
                  knownMappings,
                });
              return result.availability === "unavailable"
                ? this.options.database.markImportUnavailable({
                    importRunId: run.id,
                    completedAt,
                    reason: result.reason,
                  })
                : this.options.database.commitTransactionImport({
                    importRunId: run.id,
                    snapshot: result.snapshot,
                    completedAt,
                  });
            }
          : async (completedAt: string) => {
              if (run.seasonYear < 2018) {
                return this.options.database.markImportUnavailable({
                  importRunId: run.id,
                  completedAt,
                  reason:
                    "Fantasy-relevant player history is unavailable before 2018",
                });
              }

              const [core, relevantPlayers, knownMappings] =
                await Promise.all([
                  this.requireCoreSeason(run.seasonYear),
                  this.options.database.listRelevantPlayers(
                    run.seasonYear,
                  ),
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
              const snapshot =
                await this.options.nflSource.fetchPlayerStats({
                  year: run.seasonYear,
                  scoringPeriods,
                  relevantPlayers,
                  knownMappings,
                });

              return this.options.database.commitPlayerStatsImport({
                importRunId: run.id,
                snapshot,
                completedAt,
              });
            };

    try {
      return await commit(this.now().toISOString());
    } catch (operationError) {
      try {
        await this.options.database.failImportRun({
          importRunId: run.id,
          completedAt: this.now().toISOString(),
          errorMessage: safeAuditMessage(operationError),
        });
      } catch (auditError) {
        throw new AggregateError(
          [operationError, auditError],
          `Season ${run.seasonYear} ${run.dataset} import failed and its audit record could not be updated`,
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
