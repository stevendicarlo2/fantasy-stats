import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SeasonImportService } from "@/application/services/season-import-service";
import type { CloseableDatabaseProvider } from "@/server/adapters/database/libsql/libsql-database-provider";
import { createLibSqlDatabaseProvider } from "@/server/adapters/database/libsql/libsql-database-provider";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";

const hasLiveConfiguration = [
  "ESPN_LEAGUE_ID",
  "ESPN_EARLIEST_SEASON",
  "ESPN_S2",
  "ESPN_SWID",
].every((name) => process.env[name]?.trim());

describe.skipIf(!hasLiveConfiguration)("ESPN import integration", () => {
  let directory: string;
  let database: CloseableDatabaseProvider;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "fantasy-stats-import-"));
    database = createLibSqlDatabaseProvider({
      url: `file:${join(directory, "database.db")}`,
      migrationsDirectory: resolve(process.cwd(), "migrations"),
    });
    await database.runMigrations();
  });

  afterAll(async () => {
    database.close();
    await rm(directory, { recursive: true });
  });

  it("imports every configured season and exposes qualification standings", async () => {
    const earliestSeason = Number(process.env.ESPN_EARLIEST_SEASON);
    const latestSeason = 2025;
    const source = new EspnFantasySource({
      leagueId: Number(process.env.ESPN_LEAGUE_ID),
      earliestSeason,
      espnS2: process.env.ESPN_S2!,
      swid: process.env.ESPN_SWID!,
    });
    const service = new SeasonImportService({ database, source });

    for (let year = earliestSeason; year <= latestSeason; year += 1) {
      await service.importSeason(year);
    }

    await expect(
      database.executeReadOnlyQuery({
        statement: "SELECT COUNT(*) AS count FROM seasons",
      }),
    ).resolves.toEqual({
      columns: ["count"],
      rows: [{ count: latestSeason - earliestSeason + 1 }],
    });

    const standings = await database.executeReadOnlyQuery({
      statement: `
        SELECT COUNT(*) AS count
        FROM regular_season_anp_standings
        WHERE season_year BETWEEN ? AND ?
      `,
      parameters: [earliestSeason, latestSeason],
    });

    expect(standings.rows[0].count).toBeGreaterThan(0);
  });
});
