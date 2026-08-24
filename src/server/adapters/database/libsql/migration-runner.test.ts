import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
