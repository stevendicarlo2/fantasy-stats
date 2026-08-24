import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createClient,
  type Client,
  type Transaction,
} from "@libsql/client/sqlite3";
import { z } from "zod";

import type { MigrationResult } from "@/application/ports/database-provider";

const migrationFilePattern = /^\d{4}_[a-z0-9_]+\.sql$/;

const appliedMigrationRowSchema = z.object({
  name: z.string(),
  checksum: z.string(),
});

interface Migration {
  name: string;
  checksum: string;
  sql: string;
}

export interface LocalMigrationRunnerOptions {
  databaseUrl: string;
  migrationsDirectory: string;
}

export interface LocalMigrationRunner {
  runMigrations(): Promise<MigrationResult>;
  close(): void;
}

export class MigrationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationConfigurationError";
  }
}

export class MigrationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationIntegrityError";
  }
}

async function loadMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  for (const name of migrationNames) {
    if (!migrationFilePattern.test(name)) {
      throw new MigrationConfigurationError(
        `Migration ${name} must use the format 0001_descriptive_name.sql`,
      );
    }
  }

  const versions = migrationNames.map((name) => name.slice(0, 4));
  const duplicateVersion = versions.find(
    (version, index) => versions.indexOf(version) !== index,
  );

  if (duplicateVersion) {
    throw new MigrationConfigurationError(
      `Migration version ${duplicateVersion} is used more than once`,
    );
  }

  return Promise.all(
    migrationNames.map(async (name) => {
      const sql = await readFile(resolve(directory, name), "utf8");

      if (sql.trim().length === 0) {
        throw new MigrationConfigurationError(
          `Migration ${name} must not be empty`,
        );
      }

      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function loadAppliedMigrations(client: Client) {
  const result = await client.execute(
    "SELECT name, checksum FROM _fantasy_stats_migrations ORDER BY name",
  );

  return result.rows.map((row) => appliedMigrationRowSchema.parse(row));
}

function validateMigrationHistory(
  migrations: Migration[],
  appliedMigrations: { name: string; checksum: string }[],
) {
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.name, migration]),
  );

  for (const appliedMigration of appliedMigrations) {
    const migration = migrationsByName.get(appliedMigration.name);

    if (!migration) {
      throw new MigrationIntegrityError(
        `Applied migration ${appliedMigration.name} is missing from the migrations directory`,
      );
    }

    if (migration.checksum !== appliedMigration.checksum) {
      throw new MigrationIntegrityError(
        `Applied migration ${appliedMigration.name} has changed`,
      );
    }
  }
}

async function applyMigrations(
  client: Client,
  migrations: Migration[],
): Promise<string[]> {
  if (migrations.length === 0) {
    return [];
  }

  const transaction = await client.transaction("write");

  try {
    for (const migration of migrations) {
      await transaction.executeMultiple(migration.sql);
      await transaction.execute({
        sql: `
          INSERT INTO _fantasy_stats_migrations (name, checksum, applied_at)
          VALUES (?, ?, ?)
        `,
        args: [
          migration.name,
          migration.checksum,
          new Date().toISOString(),
        ],
      });
    }

    await transaction.commit();
    return migrations.map((migration) => migration.name);
  } catch (error) {
    await rollbackOpenTransaction(transaction);
    throw error;
  } finally {
    transaction.close();
  }
}

async function rollbackOpenTransaction(transaction: Transaction) {
  if (!transaction.closed) {
    await transaction.rollback();
  }
}

export function createLocalMigrationRunner(
  options: LocalMigrationRunnerOptions,
): LocalMigrationRunner {
  if (!options.databaseUrl.startsWith("file:")) {
    throw new MigrationConfigurationError(
      "Local migration databases must use a file: URL",
    );
  }

  const client = createClient({ url: options.databaseUrl });
  const runner = createMigrationRunner(client, options.migrationsDirectory);

  return {
    runMigrations: runner.runMigrations,
    close() {
      client.close();
    },
  };
}

export function createMigrationRunner(
  client: Client,
  migrationsDirectory: string,
): Pick<LocalMigrationRunner, "runMigrations"> {
  return {
    async runMigrations() {
      const migrations = await loadMigrations(migrationsDirectory);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS _fantasy_stats_migrations (
          name TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);

      const appliedMigrations = await loadAppliedMigrations(client);
      validateMigrationHistory(migrations, appliedMigrations);

      const appliedNames = new Set(
        appliedMigrations.map((migration) => migration.name),
      );
      const pendingMigrations = migrations.filter(
        (migration) => !appliedNames.has(migration.name),
      );

      return {
        appliedMigrations: await applyMigrations(client, pendingMigrations),
      };
    },
  };
}
