import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@libsql/client/sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLocalMigrationRunner,
  MigrationConfigurationError,
  MigrationIntegrityError,
} from "./migration-runner";

const temporaryDirectories: string[] = [];

async function createTemporaryDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "fantasy-stats-migrations-"));
  temporaryDirectories.push(directory);

  return {
    directory,
    databaseUrl: `file:${join(directory, "database.db")}`,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true }),
    ),
  );
});

describe("createLocalMigrationRunner", () => {
  it("applies migrations in order and skips them on later runs", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    await writeFile(
      join(directory, "0002_add_name.sql"),
      "ALTER TABLE example ADD COLUMN name TEXT;",
    );
    await writeFile(
      join(directory, "0001_create_example.sql"),
      "CREATE TABLE example (id INTEGER PRIMARY KEY);",
    );

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await expect(runner.runMigrations()).resolves.toEqual({
      appliedMigrations: [
        "0001_create_example.sql",
        "0002_add_name.sql",
      ],
    });
    await expect(runner.runMigrations()).resolves.toEqual({
      appliedMigrations: [],
    });
    runner.close();

    const client = createClient({ url: databaseUrl });
    const result = await client.execute(
      "SELECT name FROM _fantasy_stats_migrations ORDER BY name",
    );
    client.close();

    expect(result.rows).toEqual([
      { name: "0001_create_example.sql" },
      { name: "0002_add_name.sql" },
    ]);
  });

  it("rejects a changed migration after it has been applied", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    const migrationPath = join(directory, "0001_create_example.sql");
    await writeFile(migrationPath, "CREATE TABLE example (id INTEGER);");

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await runner.runMigrations();
    await writeFile(
      migrationPath,
      "CREATE TABLE example (id INTEGER, name TEXT);",
    );

    await expect(runner.runMigrations()).rejects.toThrow(
      MigrationIntegrityError,
    );
    runner.close();
  });

  it("rejects a missing migration after it has been applied", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    const migrationPath = join(directory, "0001_create_example.sql");
    await writeFile(migrationPath, "CREATE TABLE example (id INTEGER);");

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await runner.runMigrations();
    await unlink(migrationPath);

    await expect(runner.runMigrations()).rejects.toThrow(
      MigrationIntegrityError,
    );
    runner.close();
  });

  it("removes inferred season names in the corrective migration", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    await writeFile(
      join(directory, "0001_prerequisites.sql"),
      `
        CREATE TABLE seasons (
          id TEXT PRIMARY KEY,
          team_count INTEGER NOT NULL
        );
        CREATE TABLE franchises (id TEXT PRIMARY KEY);
        CREATE TABLE season_franchises (
          season_id TEXT NOT NULL,
          franchise_id TEXT NOT NULL,
          PRIMARY KEY (season_id, franchise_id)
        );
        CREATE TABLE franchise_names (
          franchise_id TEXT NOT NULL,
          name TEXT NOT NULL
        );
        INSERT INTO seasons (id, team_count) VALUES ('season-1', 2);
        INSERT INTO franchises (id) VALUES ('team-1');
        INSERT INTO season_franchises (season_id, franchise_id)
          VALUES ('season-1', 'team-1');
        INSERT INTO franchise_names (franchise_id, name)
          VALUES ('team-1', 'A Name'), ('team-1', 'Z Name');
      `,
    );
    await copyFile(
      resolve(
        process.cwd(),
        "migrations/0006_season_franchise_names.sql",
      ),
      join(directory, "0002_season_franchise_names.sql"),
    );
    await copyFile(
      resolve(
        process.cwd(),
        "migrations/0007_season_playoff_team_count.sql",
      ),
      join(directory, "0003_season_playoff_team_count.sql"),
    );

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await runner.runMigrations();
    runner.close();

    const client = createClient({ url: databaseUrl });
    const names = await client.execute(
      "SELECT name FROM season_franchise_names",
    );
    const columns = await client.execute(
      "PRAGMA table_info(seasons)",
    );
    client.close();

    expect(names.rows).toEqual([]);
    expect(columns.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "playoff_team_count" }),
      ]),
    );
  });

  it("rolls back every pending migration when one fails", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    await writeFile(
      join(directory, "0001_create_example.sql"),
      "CREATE TABLE example (id INTEGER);",
    );
    await writeFile(
      join(directory, "0002_invalid.sql"),
      "INSERT INTO missing_table (id) VALUES (1);",
    );

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await expect(runner.runMigrations()).rejects.toThrow();
    runner.close();

    const client = createClient({ url: databaseUrl });
    const tableResult = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      args: ["example"],
    });
    const historyResult = await client.execute(
      "SELECT name FROM _fantasy_stats_migrations",
    );
    client.close();

    expect(tableResult.rows).toEqual([]);
    expect(historyResult.rows).toEqual([]);
  });

  it("rejects invalid migration filenames", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    await writeFile(
      join(directory, "initial.sql"),
      "CREATE TABLE example (id INTEGER);",
    );

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await expect(runner.runMigrations()).rejects.toThrow(
      MigrationConfigurationError,
    );
    runner.close();
  });

  it("rejects duplicate migration versions", async () => {
    const { databaseUrl, directory } = await createTemporaryDatabase();
    await writeFile(
      join(directory, "0001_create_example.sql"),
      "CREATE TABLE example (id INTEGER);",
    );
    await writeFile(
      join(directory, "0001_create_other.sql"),
      "CREATE TABLE other (id INTEGER);",
    );

    const runner = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: directory,
    });

    await expect(runner.runMigrations()).rejects.toThrow(
      "Migration version 0001 is used more than once",
    );
    runner.close();
  });

  it("rejects remote database URLs", async () => {
    const { directory } = await createTemporaryDatabase();

    expect(() =>
      createLocalMigrationRunner({
        databaseUrl: "libsql://example.turso.io",
        migrationsDirectory: directory,
      }),
    ).toThrow(MigrationConfigurationError);
  });

  it("preserves rows in tables with ON DELETE CASCADE foreign keys when a later migration rebuilds the table they reference", async () => {
    // This reproduces the real repository migration set: it applies
    // 0001-0008, seeds one row into every table that has an
    // `ON DELETE CASCADE` foreign key onto `matchups` (the exact shape
    // migration 0009 rebuilds), then applies 0009 and asserts none of that
    // data was silently deleted. SQLite performs an implicit cascading
    // DELETE on ON DELETE CASCADE dependents the moment a referenced table
    // is dropped, whenever foreign key enforcement is on - which it is by
    // default for these local sqlite3-backed databases - so this guards
    // against any future table-rebuild migration reintroducing that bug.
    const realMigrationsDirectory = resolve(process.cwd(), "migrations");
    const { directory, databaseUrl } = await createTemporaryDatabase();
    const stagedMigrationsDirectory = join(directory, "staged");
    await mkdir(stagedMigrationsDirectory);

    const migrationFiles = (
      await readdir(realMigrationsDirectory)
    ).filter((name) => name.endsWith(".sql")).sort();
    const migrationsBeforeRebuild = migrationFiles.filter(
      (name) => name < "0009",
    );

    for (const name of migrationsBeforeRebuild) {
      await copyFile(
        join(realMigrationsDirectory, name),
        join(stagedMigrationsDirectory, name),
      );
    }

    const runnerBeforeRebuild = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: stagedMigrationsDirectory,
    });
    await runnerBeforeRebuild.runMigrations();
    runnerBeforeRebuild.close();

    const client = createClient({ url: databaseUrl });
    const seasonId = randomUUID();
    const homeFranchiseId = randomUUID();
    const awayFranchiseId = randomUUID();
    const matchupId = randomUUID();
    const leagueId = randomUUID();

    await client.execute({
      sql: "INSERT INTO leagues (id, name) VALUES (?, 'Test League')",
      args: [leagueId],
    });
    await client.execute({
      sql: `
        INSERT INTO seasons
          (id, league_id, year, team_count, regular_season_start_week,
           regular_season_end_week)
        VALUES (?, ?, 2023, 2, 1, 1)
      `,
      args: [seasonId, leagueId],
    });
    await client.execute({
      sql: "INSERT INTO franchises (id, league_id) VALUES (?, ?), (?, ?)",
      args: [homeFranchiseId, leagueId, awayFranchiseId, leagueId],
    });
    await client.execute({
      sql: `
        INSERT INTO matchups
          (id, season_id, week, phase, home_franchise_id, away_franchise_id)
        VALUES (?, ?, 1, 'regular', ?, ?)
      `,
      args: [matchupId, seasonId, homeFranchiseId, awayFranchiseId],
    });
    await client.execute({
      sql: `
        INSERT INTO imported_matchup_scores (matchup_id, franchise_id, score)
        VALUES (?, ?, 100), (?, ?, 90)
      `,
      args: [matchupId, homeFranchiseId, matchupId, awayFranchiseId],
    });
    await client.execute({
      sql: `
        INSERT INTO matchup_overrides
          (id, matchup_id, franchise_id, score_adjustment, reason, created_at)
        VALUES (?, ?, ?, 5, 'manual correction', ?)
      `,
      args: [randomUUID(), matchupId, homeFranchiseId, new Date().toISOString()],
    });
    await client.execute({
      sql: `
        INSERT INTO matchup_scoring_periods (matchup_id, scoring_period)
        VALUES (?, 1)
      `,
      args: [matchupId],
    });
    client.close();

    await copyFile(
      join(realMigrationsDirectory, "0009_playoff_elimination_phases.sql"),
      join(stagedMigrationsDirectory, "0009_playoff_elimination_phases.sql"),
    );

    const runnerAfterRebuild = createLocalMigrationRunner({
      databaseUrl,
      migrationsDirectory: stagedMigrationsDirectory,
    });
    await runnerAfterRebuild.runMigrations();
    runnerAfterRebuild.close();

    const verificationClient = createClient({ url: databaseUrl });
    const [matchups, scores, overrides, scoringPeriods] = await Promise.all([
      verificationClient.execute("SELECT COUNT(*) AS n FROM matchups"),
      verificationClient.execute(
        "SELECT COUNT(*) AS n FROM imported_matchup_scores",
      ),
      verificationClient.execute(
        "SELECT COUNT(*) AS n FROM matchup_overrides",
      ),
      verificationClient.execute(
        "SELECT COUNT(*) AS n FROM matchup_scoring_periods",
      ),
    ]);
    verificationClient.close();

    expect(matchups.rows[0].n).toBe(1);
    expect(scores.rows[0].n).toBe(2);
    expect(overrides.rows[0].n).toBe(1);
    expect(scoringPeriods.rows[0].n).toBe(1);
  });
});
