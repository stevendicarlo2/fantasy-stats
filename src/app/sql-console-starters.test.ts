import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sqlStarterQueries } from "./sql-console-starters";
import { createLibSqlDatabaseProvider } from "@/server/adapters/database/libsql/libsql-database-provider";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true }),
    ),
  );
});

describe("SQL console starter queries", () => {
  it("executes every starter against the canonical schema", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-sql-console-"),
    );
    temporaryDirectories.push(directory);
    const provider = createLibSqlDatabaseProvider({
      url: `file:${join(directory, "database.db")}`,
      migrationsDirectory: resolve(process.cwd(), "migrations"),
    });

    try {
      await provider.runMigrations();

      for (const query of sqlStarterQueries) {
        await expect(
          provider.executeReadOnlyQuery({
            statement: query.statement,
            parameters: JSON.parse(query.parameters),
          }),
          query.label,
        ).resolves.toBeDefined();
      }
    } finally {
      provider.close();
    }
  });
});
