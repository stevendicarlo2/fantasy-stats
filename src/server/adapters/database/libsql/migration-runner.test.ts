import {
  copyFile,
  mkdtemp,
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
});
