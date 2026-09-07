import { resolve } from "node:path";

import {
  createClient,
  type Client,
  type InStatement,
  type InValue,
  type ResultSet,
  type Transaction,
} from "@libsql/client";
import { z } from "zod";

import { SafeOperationalError } from "@/application/errors";
import type {
  CommitSeasonImportInput,
  CommitPlayerStatsImportInput,
  CommitRosterImportInput,
  CommitTransactionImportInput,
  DatabaseProvider,
  FailImportRunInput,
  MarkImportUnavailableInput,
  MigrationResult,
  ReadOnlyQuery,
  ReadOnlyQueryResult,
  StartImportRunInput,
} from "@/application/ports/database-provider";
import {
  readOnlyQueryResultSchema,
  weeklyTeamResultSchema,
} from "@/application/ports/schemas";
import {
  franchiseNameSchema,
  franchiseDisplayNameSchema,
  franchiseSchema,
  importedMatchupScoreSchema,
  importRunSchema,
  leagueSchema,
  matchupScoringPeriodSchema,
  matchupOverrideSchema,
  matchupSchema,
  seasonImportSnapshotSchema,
  seasonSchema,
  sourceMappingSchema,
} from "@/domain/schemas";
import type {
  CanonicalId,
  FranchiseDisplayName,
  ImportRun,
  MatchupOverride,
  SeasonImportSnapshot,
  SourceMapping,
} from "@/domain/types";

import { createMigrationRunner } from "./migration-runner";
import {
  getMatchupRosterDetail,
  listRelevantPlayers,
  listSeasonDatasetStatuses,
  replacePlayerStatsData,
  replaceRosterData,
  replaceTransactionData,
} from "./supplemental-data";

type SqlExecutor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

const overrideTargetRowSchema = z.object({
  matchupId: z.uuid(),
  franchiseId: z.uuid(),
});

const seasonYearRowSchema = z.object({
  year: z.number().int(),
});

export interface LibSqlDatabaseProviderOptions {
  url: string;
  authToken?: string;
  migrationsDirectory?: string;
}

export interface CloseableDatabaseProvider extends DatabaseProvider {
  close(): void;
}

export class LibSqlDatabaseError extends SafeOperationalError {
  constructor(message: string) {
    super(message);
    this.name = "LibSqlDatabaseError";
  }
}

function expectSingleRow<T>(rows: T[], description: string): T {
  if (rows.length !== 1) {
    throw new LibSqlDatabaseError(
      `Expected one ${description} row but received ${rows.length}`,
    );
  }

  return rows[0];
}

async function selectImportRun(
  executor: SqlExecutor,
  importRunId: CanonicalId,
): Promise<ImportRun> {
  const result = await executor.execute({
    sql: `
      SELECT
        id,
        provider,
        operation,
        dataset,
        season_year AS seasonYear,
        status,
        started_at AS startedAt,
        completed_at AS completedAt,
        error_message AS errorMessage
      FROM import_runs
      WHERE id = ?
    `,
    args: [importRunId],
  });

  return importRunSchema.parse(
    expectSingleRow(result.rows, "import run"),
  );
}

async function rollbackOpenTransaction(transaction: Transaction) {
  if (!transaction.closed) {
    await transaction.rollback();
  }
}

async function runWriteTransaction<T>(
  client: Client,
  operation: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const transaction = await client.transaction("write");

  try {
    const result = await operation(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await rollbackOpenTransaction(transaction);
    throw error;
  } finally {
    transaction.close();
  }
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

async function executeWriteBatch(
  transaction: Transaction,
  statements: InStatement[],
) {
  if (statements.length > 0) {
    await transaction.batch(statements);
  }
}

async function deleteRemovedMatchups(
  transaction: Transaction,
  snapshot: SeasonImportSnapshot,
) {
  const matchupIds = snapshot.matchups.map((matchup) => matchup.id);
  const exclusionSql =
    matchupIds.length > 0
      ? `AND matchups.id NOT IN (${placeholders(matchupIds)})`
      : "";
  const args = [snapshot.season.id, ...matchupIds];
  const protectedMatchups = await transaction.execute({
    sql: `
      SELECT matchups.id
      FROM matchups
      INNER JOIN matchup_overrides
        ON matchup_overrides.matchup_id = matchups.id
      WHERE matchups.season_id = ?
      ${exclusionSql}
      LIMIT 1
    `,
    args,
  });

  if (protectedMatchups.rows.length > 0) {
    throw new LibSqlDatabaseError(
      "Cannot remove an imported matchup that has a manual override",
    );
  }

  await transaction.execute({
    sql: `
      DELETE FROM matchups
      WHERE season_id = ?
      ${matchupIds.length > 0 ? `AND id NOT IN (${placeholders(matchupIds)})` : ""}
    `,
    args,
  });
}

async function validateExistingOverrides(
  transaction: Transaction,
  snapshot: SeasonImportSnapshot,
) {
  const result = await transaction.execute({
    sql: `
      SELECT
        matchup_overrides.matchup_id AS matchupId,
        matchup_overrides.franchise_id AS franchiseId
      FROM matchup_overrides
      INNER JOIN matchups ON matchups.id = matchup_overrides.matchup_id
      WHERE matchups.season_id = ?
    `,
    args: [snapshot.season.id],
  });
  const matchupsById = new Map(
    snapshot.matchups.map((matchup) => [matchup.id, matchup]),
  );

  for (const row of result.rows) {
    const override = overrideTargetRowSchema.parse(row);
    const matchup = matchupsById.get(override.matchupId);

    if (
      !matchup ||
      (matchup.homeFranchiseId !== override.franchiseId &&
        matchup.awayFranchiseId !== override.franchiseId)
    ) {
      throw new LibSqlDatabaseError(
        "A season refresh cannot invalidate an existing matchup override",
      );
    }
  }
}

async function upsertSeasonSnapshot(
  transaction: Transaction,
  snapshot: SeasonImportSnapshot,
) {
  await executeWriteBatch(transaction, [
    {
      sql: `
        INSERT INTO leagues (id, name)
        VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name
      `,
      args: [snapshot.league.id, snapshot.league.name],
    },
    {
      sql: `
        INSERT INTO seasons (
          id,
          league_id,
          year,
          team_count,
          playoff_team_count,
          regular_season_start_week,
          regular_season_end_week
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          league_id = excluded.league_id,
          year = excluded.year,
          team_count = excluded.team_count,
          playoff_team_count = excluded.playoff_team_count,
          regular_season_start_week = excluded.regular_season_start_week,
          regular_season_end_week = excluded.regular_season_end_week
      `,
      args: [
        snapshot.season.id,
        snapshot.season.leagueId,
        snapshot.season.year,
        snapshot.season.teamCount,
        snapshot.season.playoffTeamCount,
        snapshot.season.regularSeasonStartWeek,
        snapshot.season.regularSeasonEndWeek,
      ],
    },
    ...snapshot.franchises.map((franchise) => ({
      sql: `
        INSERT INTO franchises (id, league_id, owner_name)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          league_id = excluded.league_id,
          owner_name = excluded.owner_name
      `,
      args: [franchise.id, franchise.leagueId, franchise.ownerName],
    })),
    {
      sql: "DELETE FROM season_franchise_names WHERE season_id = ?",
      args: [snapshot.season.id],
    },
    {
      sql: "DELETE FROM season_franchises WHERE season_id = ?",
      args: [snapshot.season.id],
    },
    ...snapshot.franchises.map((franchise) => ({
      sql: `
        INSERT INTO season_franchises (season_id, franchise_id)
        VALUES (?, ?)
      `,
      args: [snapshot.season.id, franchise.id],
    })),
    ...snapshot.franchiseNames.map((franchiseName) => ({
      sql: `
        INSERT INTO franchise_names (franchise_id, name)
        VALUES (?, ?)
        ON CONFLICT(franchise_id, name) DO NOTHING
      `,
      args: [franchiseName.franchiseId, franchiseName.name],
    })),
    ...snapshot.seasonFranchiseNames.map((franchiseName) => ({
      sql: `
        INSERT INTO season_franchise_names (
          season_id,
          franchise_id,
          name
        )
        VALUES (?, ?, ?)
        ON CONFLICT(season_id, franchise_id) DO UPDATE SET
          name = excluded.name
      `,
      args: [
        snapshot.season.id,
        franchiseName.franchiseId,
        franchiseName.name,
      ],
    })),
  ]);

  await validateExistingOverrides(transaction, snapshot);
  await deleteRemovedMatchups(transaction, snapshot);

  await executeWriteBatch(transaction, [
    ...snapshot.matchups.flatMap((matchup) => [
      {
        sql: `
          INSERT INTO matchups (
            id,
            season_id,
            week,
            phase,
            home_franchise_id,
            away_franchise_id
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            season_id = excluded.season_id,
            week = excluded.week,
            phase = excluded.phase,
            home_franchise_id = excluded.home_franchise_id,
            away_franchise_id = excluded.away_franchise_id
        `,
        args: [
          matchup.id,
          matchup.seasonId,
          matchup.week,
          matchup.phase,
          matchup.homeFranchiseId,
          matchup.awayFranchiseId,
        ],
      },
      {
        sql: "DELETE FROM imported_matchup_scores WHERE matchup_id = ?",
        args: [matchup.id],
      },
    ]),
    {
      sql: `
        DELETE FROM matchup_scoring_periods
        WHERE matchup_id IN (
          SELECT id FROM matchups WHERE season_id = ?
        )
      `,
      args: [snapshot.season.id],
    },
    ...(snapshot.matchupScoringPeriods ??
      snapshot.matchups.map((matchup) => ({
        matchupId: matchup.id,
        scoringPeriod: matchup.week,
      }))).map((period) => ({
      sql: `
        INSERT INTO matchup_scoring_periods (
          matchup_id,
          scoring_period
        )
        VALUES (?, ?)
      `,
      args: [period.matchupId, period.scoringPeriod],
    })),
    ...snapshot.scores.map((score) => ({
      sql: `
        INSERT INTO imported_matchup_scores (
          matchup_id,
          franchise_id,
          score
        )
        VALUES (?, ?, ?)
      `,
      args: [score.matchupId, score.franchiseId, score.score],
    })),
    ...snapshot.sourceMappings.map((mapping) => ({
      sql: `
        INSERT INTO source_mappings (
          provider,
          entity_type,
          canonical_id,
          external_id
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(provider, entity_type, external_id) DO UPDATE SET
          canonical_id = excluded.canonical_id
      `,
      args: [
        mapping.provider,
        mapping.entityType,
        mapping.canonicalId,
        mapping.externalId,
      ],
    })),
  ]);
}

async function loadSeasonSnapshot(
  client: Client,
  seasonYear: number,
): Promise<SeasonImportSnapshot | null> {
  const seasonResult = await client.execute({
    sql: `
      SELECT
        id,
        league_id AS leagueId,
        year,
        team_count AS teamCount,
        playoff_team_count AS playoffTeamCount,
        regular_season_start_week AS regularSeasonStartWeek,
        regular_season_end_week AS regularSeasonEndWeek
      FROM seasons
      WHERE year = ?
    `,
    args: [seasonYear],
  });

  if (seasonResult.rows.length === 0) {
    return null;
  }

  const season = seasonSchema.parse(
    expectSingleRow(seasonResult.rows, "season"),
  );
  const leagueResult = await client.execute({
    sql: "SELECT id, name FROM leagues WHERE id = ?",
    args: [season.leagueId],
  });
  const franchiseResult = await client.execute({
    sql: `
      SELECT
        franchises.id,
        franchises.league_id AS leagueId,
        franchises.owner_name AS ownerName
      FROM franchises
      INNER JOIN season_franchises
        ON season_franchises.franchise_id = franchises.id
      WHERE season_franchises.season_id = ?
      ORDER BY franchises.id
    `,
    args: [season.id],
  });
  const franchiseNameResult = await client.execute({
    sql: `
      SELECT
        franchise_names.franchise_id AS franchiseId,
        franchise_names.name
      FROM franchise_names
      INNER JOIN season_franchises
        ON season_franchises.franchise_id = franchise_names.franchise_id
      WHERE season_franchises.season_id = ?
      ORDER BY franchise_names.franchise_id, franchise_names.name
    `,
    args: [season.id],
  });
  const seasonFranchiseNameResult = await client.execute({
    sql: `
      SELECT
        franchise_id AS franchiseId,
        name
      FROM season_franchise_names
      WHERE season_id = ?
      ORDER BY franchise_id
    `,
    args: [season.id],
  });
  const matchupResult = await client.execute({
    sql: `
      SELECT
        id,
        season_id AS seasonId,
        week,
        phase,
        home_franchise_id AS homeFranchiseId,
        away_franchise_id AS awayFranchiseId
      FROM matchups
      WHERE season_id = ?
      ORDER BY week, id
    `,
    args: [season.id],
  });
  const scoreResult = await client.execute({
    sql: `
      SELECT
        imported_matchup_scores.matchup_id AS matchupId,
        imported_matchup_scores.franchise_id AS franchiseId,
        imported_matchup_scores.score
      FROM imported_matchup_scores
      INNER JOIN matchups
        ON matchups.id = imported_matchup_scores.matchup_id
      WHERE matchups.season_id = ?
      ORDER BY imported_matchup_scores.matchup_id,
        imported_matchup_scores.franchise_id
    `,
    args: [season.id],
  });
  const matchupScoringPeriodResult = await client.execute({
    sql: `
      SELECT
        matchup_scoring_periods.matchup_id AS matchupId,
        matchup_scoring_periods.scoring_period AS scoringPeriod
      FROM matchup_scoring_periods
      INNER JOIN matchups
        ON matchups.id = matchup_scoring_periods.matchup_id
      WHERE matchups.season_id = ?
      ORDER BY matchup_scoring_periods.matchup_id,
        matchup_scoring_periods.scoring_period
    `,
    args: [season.id],
  });

  const canonicalIds = [
    season.leagueId,
    season.id,
    ...franchiseResult.rows.map((row) => String(row.id)),
    ...matchupResult.rows.map((row) => String(row.id)),
  ];
  const mappingResult = await client.execute({
    sql: `
      SELECT
        provider,
        entity_type AS entityType,
        canonical_id AS canonicalId,
        external_id AS externalId
      FROM source_mappings
      WHERE canonical_id IN (${placeholders(canonicalIds)})
      ORDER BY provider, entity_type, external_id
    `,
    args: canonicalIds,
  });

  return seasonImportSnapshotSchema.parse({
    league: leagueSchema.parse(
      expectSingleRow(leagueResult.rows, "league"),
    ),
    season,
    franchises: franchiseResult.rows.map((row) =>
      franchiseSchema.parse(row),
    ),
    franchiseNames: franchiseNameResult.rows.map((row) =>
      franchiseNameSchema.parse(row),
    ),
    seasonFranchiseNames: seasonFranchiseNameResult.rows.map((row) =>
      franchiseNameSchema.parse(row),
    ),
    matchups: matchupResult.rows.map((row) => matchupSchema.parse(row)),
    matchupScoringPeriods: matchupScoringPeriodResult.rows.map((row) =>
      matchupScoringPeriodSchema.parse(row),
    ),
    scores: scoreResult.rows.map((row) =>
      importedMatchupScoreSchema.parse(row),
    ),
    sourceMappings: mappingResult.rows.map((row) =>
      sourceMappingSchema.parse(row),
    ),
  });
}

function mapQueryValue(value: InValue): string | number | null {
  if (value === null || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new LibSqlDatabaseError(
        "Read-only query returned a non-finite number",
      );
    }

    return value;
  }

  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }

  throw new LibSqlDatabaseError(
    "Read-only query returned an unsupported binary value",
  );
}

function mapQueryResult(result: ResultSet): ReadOnlyQueryResult {
  return {
    columns: [...result.columns],
    rows: result.rows.map((row) =>
      Object.fromEntries(
        result.columns.map((column) => [
          column,
          mapQueryValue(row[column]),
        ]),
      ),
    ),
  };
}

const mutatingSqlKeywords = new Set([
  "ALTER",
  "ANALYZE",
  "ATTACH",
  "BEGIN",
  "COMMIT",
  "CREATE",
  "DELETE",
  "DETACH",
  "DROP",
  "INSERT",
  "PRAGMA",
  "REINDEX",
  "RELEASE",
  "ROLLBACK",
  "SAVEPOINT",
  "UPDATE",
  "VACUUM",
]);

function maskQuotedSql(statement: string) {
  let masked = "";

  for (let index = 0; index < statement.length; index += 1) {
    const character = statement[index];
    const nextCharacter = statement[index + 1];

    if (character === "-" && nextCharacter === "-") {
      const end = statement.indexOf("\n", index + 2);
      masked += " ".repeat(
        (end === -1 ? statement.length : end) - index,
      );
      index = (end === -1 ? statement.length : end) - 1;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      const end = statement.indexOf("*/", index + 2);

      if (end === -1) {
        throw new LibSqlDatabaseError("SQL contains an unterminated comment");
      }

      masked += " ".repeat(end + 2 - index);
      index = end + 1;
      continue;
    }

    const quoteEnd =
      character === "'" || character === '"' || character === "`"
        ? character
        : character === "["
          ? "]"
          : null;

    if (quoteEnd) {
      const start = index;
      index += 1;

      while (index < statement.length) {
        if (statement[index] === quoteEnd) {
          if (
            quoteEnd !== "]" &&
            statement[index + 1] === quoteEnd
          ) {
            index += 2;
            continue;
          }

          break;
        }

        index += 1;
      }

      if (index >= statement.length) {
        throw new LibSqlDatabaseError("SQL contains an unterminated quote");
      }

      masked += " ".repeat(index + 1 - start);
      continue;
    }

    masked += character;
  }

  return masked;
}

function assertReadOnlyStatement(statement: string) {
  let normalized = maskQuotedSql(statement).trim();

  if (normalized.endsWith(";")) {
    normalized = normalized.slice(0, -1).trimEnd();
  }

  if (normalized.includes(";")) {
    throw new LibSqlDatabaseError(
      "Read-only queries must contain exactly one statement",
    );
  }

  if (/\bREPLACE\b(?!\s*\()/i.test(normalized)) {
    throw new LibSqlDatabaseError(
      "Read-only queries cannot contain mutating REPLACE statements",
    );
  }

  const keywords =
    normalized.toUpperCase().match(/[A-Z_][A-Z0-9_]*/g) ?? [];
  const firstKeyword = keywords[0];

  if (
    firstKeyword !== "SELECT" &&
    firstKeyword !== "WITH" &&
    firstKeyword !== "EXPLAIN"
  ) {
    throw new LibSqlDatabaseError(
      "Read-only queries must begin with SELECT, WITH, or EXPLAIN",
    );
  }

  const mutatingKeyword = keywords.find((keyword) =>
    mutatingSqlKeywords.has(keyword),
  );

  if (mutatingKeyword) {
    throw new LibSqlDatabaseError(
      `Read-only queries cannot contain ${mutatingKeyword}`,
    );
  }
}

class LibSqlDatabaseProvider implements CloseableDatabaseProvider {
  private readonly migrationRunner;

  constructor(
    private readonly client: Client,
    migrationsDirectory: string,
  ) {
    this.migrationRunner = createMigrationRunner(
      client,
      migrationsDirectory,
    );
  }

  runMigrations(): Promise<MigrationResult> {
    return this.migrationRunner.runMigrations();
  }

  async listSourceMappings(provider: string): Promise<SourceMapping[]> {
    const result = await this.client.execute({
      sql: `
        SELECT
          provider,
          entity_type AS entityType,
          canonical_id AS canonicalId,
          external_id AS externalId
        FROM source_mappings
        WHERE provider = ?
        ORDER BY entity_type, external_id
      `,
      args: [provider],
    });

    return result.rows.map((row) => sourceMappingSchema.parse(row));
  }

  async listFranchiseDisplayNames(): Promise<FranchiseDisplayName[]> {
    const result = await this.client.execute(`
      SELECT
        franchise_id AS franchiseId,
        display_name AS displayName
      FROM franchise_display_names
      ORDER BY display_name, franchise_id
    `);

    return result.rows.map((row) =>
      franchiseDisplayNameSchema.parse(row),
    );
  }

  async saveFranchiseDisplayName(
    displayName: FranchiseDisplayName,
  ): Promise<FranchiseDisplayName> {
    const validatedDisplayName =
      franchiseDisplayNameSchema.parse(displayName);
    const franchise = await this.client.execute({
      sql: "SELECT id FROM franchises WHERE id = ?",
      args: [validatedDisplayName.franchiseId],
    });

    if (franchise.rows.length !== 1) {
      throw new LibSqlDatabaseError(
        "A display name must target an imported franchise",
      );
    }

    await this.client.execute({
      sql: `
        INSERT INTO franchise_display_names (
          franchise_id,
          display_name
        )
        VALUES (?, ?)
        ON CONFLICT(franchise_id) DO UPDATE SET
          display_name = excluded.display_name
      `,
      args: [
        validatedDisplayName.franchiseId,
        validatedDisplayName.displayName,
      ],
    });

    return validatedDisplayName;
  }

  async startImportRun(input: StartImportRunInput): Promise<ImportRun> {
    const importRun = importRunSchema.parse({
      ...input,
      dataset: input.dataset ?? "core",
      status: "running",
      completedAt: null,
      errorMessage: null,
    });

    await this.client.execute({
      sql: `
        INSERT INTO import_runs (
          id,
          provider,
          operation,
          dataset,
          season_year,
          status,
          started_at,
          completed_at,
          error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        importRun.id,
        importRun.provider,
        importRun.operation,
        importRun.dataset ?? "core",
        importRun.seasonYear,
        importRun.status,
        importRun.startedAt,
        importRun.completedAt,
        importRun.errorMessage,
      ],
    });

    return selectImportRun(this.client, importRun.id);
  }

  async commitSeasonImport(
    input: CommitSeasonImportInput,
  ): Promise<ImportRun> {
    const snapshot = seasonImportSnapshotSchema.parse(input.snapshot);

    return runWriteTransaction(this.client, async (transaction) => {
      const importRun = await selectImportRun(
        transaction,
        input.importRunId,
      );

      if (importRun.status !== "running") {
        throw new LibSqlDatabaseError(
          `Import run ${input.importRunId} is not running`,
        );
      }

      await upsertSeasonSnapshot(transaction, snapshot);

      const updateResult = await transaction.execute({
        sql: `
          UPDATE import_runs
          SET status = 'succeeded', completed_at = ?, error_message = NULL
          WHERE id = ? AND status = 'running'
        `,
        args: [input.completedAt, input.importRunId],
      });

      if (updateResult.rowsAffected !== 1) {
        throw new LibSqlDatabaseError(
          `Import run ${input.importRunId} could not be completed`,
        );
      }

      return selectImportRun(transaction, input.importRunId);
    });
  }

  async commitRosterImport(
    input: CommitRosterImportInput,
  ): Promise<ImportRun> {
    return this.commitSupplementalImport(
      input.importRunId,
      input.completedAt,
      (transaction) => replaceRosterData(transaction, input),
    );
  }

  async commitTransactionImport(
    input: CommitTransactionImportInput,
  ): Promise<ImportRun> {
    return this.commitSupplementalImport(
      input.importRunId,
      input.completedAt,
      (transaction) => replaceTransactionData(transaction, input),
    );
  }

  async commitPlayerStatsImport(
    input: CommitPlayerStatsImportInput,
  ): Promise<ImportRun> {
    return this.commitSupplementalImport(
      input.importRunId,
      input.completedAt,
      (transaction) => replacePlayerStatsData(transaction, input),
    );
  }

  async failImportRun(input: FailImportRunInput): Promise<ImportRun> {
    if (input.errorMessage.trim().length === 0) {
      throw new LibSqlDatabaseError(
        "Failed import runs require an error message",
      );
    }

    return runWriteTransaction(this.client, async (transaction) => {
      const runningImport = await selectImportRun(
        transaction,
        input.importRunId,
      );
      const failedImport = importRunSchema.parse({
        ...runningImport,
        status: "failed",
        completedAt: input.completedAt,
        errorMessage: input.errorMessage,
      });
      const result = await transaction.execute({
        sql: `
          UPDATE import_runs
          SET status = 'failed', completed_at = ?, error_message = ?
          WHERE id = ? AND status = 'running'
        `,
        args: [
          failedImport.completedAt,
          failedImport.errorMessage,
          failedImport.id,
        ],
      });

      if (result.rowsAffected !== 1) {
        throw new LibSqlDatabaseError(
          `Running import ${input.importRunId} was not found`,
        );
      }

      return selectImportRun(transaction, input.importRunId);
    });
  }

  async markImportUnavailable(
    input: MarkImportUnavailableInput,
  ): Promise<ImportRun> {
    if (input.reason.trim().length === 0) {
      throw new LibSqlDatabaseError(
        "Unavailable import runs require a reason",
      );
    }

    return runWriteTransaction(this.client, async (transaction) => {
      const runningImport = await selectImportRun(
        transaction,
        input.importRunId,
      );
      const unavailableImport = importRunSchema.parse({
        ...runningImport,
        status: "unavailable",
        completedAt: input.completedAt,
        errorMessage: input.reason,
      });
      const result = await transaction.execute({
        sql: `
          UPDATE import_runs
          SET status = 'unavailable', completed_at = ?, error_message = ?
          WHERE id = ? AND status = 'running'
        `,
        args: [
          unavailableImport.completedAt,
          unavailableImport.errorMessage,
          unavailableImport.id,
        ],
      });

      if (result.rowsAffected !== 1) {
        throw new LibSqlDatabaseError(
          `Running import ${input.importRunId} was not found`,
        );
      }

      return selectImportRun(transaction, input.importRunId);
    });
  }

  async listImportRuns(limit = 20): Promise<ImportRun[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new LibSqlDatabaseError(
        "Import run list limit must be between 1 and 100",
      );
    }

    const result = await this.client.execute({
      sql: `
        SELECT
          id,
          provider,
          operation,
          dataset,
          season_year AS seasonYear,
          status,
          started_at AS startedAt,
          completed_at AS completedAt,
          error_message AS errorMessage
        FROM import_runs
        ORDER BY started_at DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row) => importRunSchema.parse(row));
  }

  async listImportedSeasonYears(): Promise<number[]> {
    const result = await this.client.execute(
      "SELECT year FROM seasons ORDER BY year DESC",
    );

    return result.rows.map((row) => seasonYearRowSchema.parse(row).year);
  }

  async hasSeasonImport(seasonYear: number): Promise<boolean> {
    const result = await this.client.execute({
      sql: "SELECT id FROM seasons WHERE year = ? LIMIT 1",
      args: [seasonYear],
    });

    return result.rows.length === 1;
  }

  getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null> {
    return loadSeasonSnapshot(this.client, seasonYear);
  }

  listRelevantPlayers(seasonYear: number) {
    return listRelevantPlayers(this.client, seasonYear);
  }

  getMatchupRosterDetail(
    seasonYear: number,
    matchupId: CanonicalId,
  ) {
    return getMatchupRosterDetail(this.client, seasonYear, matchupId);
  }

  listSeasonDatasetStatuses(seasonYear: number) {
    return listSeasonDatasetStatuses(this.client, seasonYear);
  }

  async listWeeklyTeamResults(seasonYear: number) {
    const result = await this.client.execute({
      sql: `
        SELECT
          results.season_year AS seasonYear,
          results.matchup_id AS matchupId,
          CASE
            WHEN matchups.home_franchise_id = results.franchise_id
              THEN 'home'
            ELSE 'away'
          END AS matchupSide,
          results.week,
          results.phase,
          results.franchise_id AS franchiseId,
          team_names.name AS teamName,
          display_names.display_name AS displayName,
          franchises.owner_name AS ownerName,
          results.opponent_franchise_id AS opponentFranchiseId,
          opponent_names.name AS opponentTeamName,
          results.effective_score AS effectiveScore,
          results.score_adjustment AS scoreAdjustment,
          results.nascar_points AS nascarPoints,
          results.head_to_head_bonus AS headToHeadBonus,
          results.adjusted_nascar_points AS adjustedNascarPoints
        FROM weekly_adjusted_nascar_points AS results
        INNER JOIN matchups ON matchups.id = results.matchup_id
        INNER JOIN franchises
          ON franchises.id = results.franchise_id
        LEFT JOIN season_franchise_names AS team_names
          ON team_names.season_id = matchups.season_id
          AND team_names.franchise_id = results.franchise_id
        LEFT JOIN franchise_display_names AS display_names
          ON display_names.franchise_id = results.franchise_id
        LEFT JOIN season_franchise_names AS opponent_names
          ON opponent_names.season_id = matchups.season_id
          AND opponent_names.franchise_id =
            results.opponent_franchise_id
        WHERE results.season_year = ?
        ORDER BY
          results.week,
          results.matchup_id,
          CASE
            WHEN matchups.home_franchise_id = results.franchise_id
              THEN 0
            ELSE 1
          END,
          results.franchise_id
      `,
      args: [seasonYear],
    });

    return result.rows.map((row) => weeklyTeamResultSchema.parse(row));
  }

  async listMatchupOverrides(
    seasonId: CanonicalId,
  ): Promise<MatchupOverride[]> {
    const result = await this.client.execute({
      sql: `
        SELECT
          matchup_overrides.id,
          matchup_overrides.matchup_id AS matchupId,
          matchup_overrides.franchise_id AS franchiseId,
          matchup_overrides.score_adjustment AS scoreAdjustment,
          matchup_overrides.reason,
          matchup_overrides.created_at AS createdAt
        FROM matchup_overrides
        INNER JOIN matchups ON matchups.id = matchup_overrides.matchup_id
        WHERE matchups.season_id = ?
        ORDER BY matchups.week, matchup_overrides.id
      `,
      args: [seasonId],
    });

    return result.rows.map((row) => matchupOverrideSchema.parse(row));
  }

  async saveMatchupOverride(
    matchupOverride: MatchupOverride,
  ): Promise<MatchupOverride> {
    const validatedOverride = matchupOverrideSchema.parse(matchupOverride);

    return runWriteTransaction(this.client, async (transaction) => {
      const participantResult = await transaction.execute({
        sql: `
          SELECT id
          FROM matchups
          WHERE id = ?
            AND (home_franchise_id = ? OR away_franchise_id = ?)
        `,
        args: [
          validatedOverride.matchupId,
          validatedOverride.franchiseId,
          validatedOverride.franchiseId,
        ],
      });

      if (participantResult.rows.length !== 1) {
        throw new LibSqlDatabaseError(
          "A matchup override must target a participating franchise",
        );
      }

      await transaction.execute({
        sql: `
          INSERT INTO matchup_overrides (
            id,
            matchup_id,
            franchise_id,
            score_adjustment,
            reason,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            matchup_id = excluded.matchup_id,
            franchise_id = excluded.franchise_id,
            score_adjustment = excluded.score_adjustment,
            reason = excluded.reason,
            created_at = excluded.created_at
        `,
        args: [
          validatedOverride.id,
          validatedOverride.matchupId,
          validatedOverride.franchiseId,
          validatedOverride.scoreAdjustment,
          validatedOverride.reason,
          validatedOverride.createdAt,
        ],
      });

      const result = await transaction.execute({
        sql: `
          SELECT
            id,
            matchup_id AS matchupId,
            franchise_id AS franchiseId,
            score_adjustment AS scoreAdjustment,
            reason,
            created_at AS createdAt
          FROM matchup_overrides
          WHERE id = ?
        `,
        args: [validatedOverride.id],
      });

      return matchupOverrideSchema.parse(
        expectSingleRow(result.rows, "matchup override"),
      );
    });
  }

  async deleteMatchupOverride(
    matchupOverrideId: CanonicalId,
  ): Promise<boolean> {
    const result = await this.client.execute({
      sql: "DELETE FROM matchup_overrides WHERE id = ?",
      args: [matchupOverrideId],
    });

    return result.rowsAffected === 1;
  }

  async executeReadOnlyQuery(
    query: ReadOnlyQuery,
  ): Promise<ReadOnlyQueryResult> {
    if (query.statement.trim().length === 0) {
      throw new LibSqlDatabaseError(
        "Read-only query statement must not be blank",
      );
    }

    assertReadOnlyStatement(query.statement);

    const transaction = await this.client.transaction("read");

    try {
      const result = await transaction.execute({
        sql: query.statement,
        args: query.parameters ?? [],
      });
      await transaction.commit();
      return readOnlyQueryResultSchema.parse(mapQueryResult(result));
    } catch (error) {
      throw new LibSqlDatabaseError(
        error instanceof Error
          ? error.message
          : "The read-only SQL query failed",
      );
    } finally {
      transaction.close();
    }
  }

  close() {
    this.client.close();
  }

  private commitSupplementalImport(
    importRunId: CanonicalId,
    completedAt: string,
    replaceData: (transaction: Transaction) => Promise<void>,
  ) {
    return runWriteTransaction(this.client, async (transaction) => {
      const importRun = await selectImportRun(transaction, importRunId);

      if (importRun.status !== "running") {
        throw new LibSqlDatabaseError(
          `Import run ${importRunId} is not running`,
        );
      }

      await replaceData(transaction);
      const updateResult = await transaction.execute({
        sql: `
          UPDATE import_runs
          SET status = 'succeeded', completed_at = ?, error_message = NULL
          WHERE id = ? AND status = 'running'
        `,
        args: [completedAt, importRunId],
      });

      if (updateResult.rowsAffected !== 1) {
        throw new LibSqlDatabaseError(
          `Import run ${importRunId} could not be completed`,
        );
      }

      return selectImportRun(transaction, importRunId);
    });
  }
}

export function createLibSqlDatabaseProvider(
  options: LibSqlDatabaseProviderOptions,
): CloseableDatabaseProvider {
  const client = createClient({
    url: options.url,
    authToken: options.authToken,
    intMode: "number",
  });

  return new LibSqlDatabaseProvider(
    client,
    options.migrationsDirectory ?? resolve(process.cwd(), "migrations"),
  );
}
