import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { defineDatabaseProviderScoringContract } from "@/application/ports/database-provider-scoring.contract";

import { createLibSqlDatabaseProvider } from "./libsql-database-provider";

defineDatabaseProviderScoringContract({
  name: "libSQL",
  async createHarness() {
    const directory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-scoring-"),
    );
    const provider = createLibSqlDatabaseProvider({
      url: `file:${join(directory, "database.db")}`,
      migrationsDirectory: resolve(process.cwd(), "migrations"),
    });

    return {
      provider,
      async cleanup() {
        provider.close();
        await rm(directory, { recursive: true });
      },
    };
  },
});
