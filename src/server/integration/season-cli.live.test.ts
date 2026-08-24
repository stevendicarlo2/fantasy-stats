import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { SeasonImportService } from "@/application/services/season-import-service";
import { runSeasonCli } from "@/cli/season-command";
import { createLibSqlDatabaseProvider } from "@/server/adapters/database/libsql/libsql-database-provider";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";

const hasLiveConfiguration = [
  "ESPN_LEAGUE_ID",
  "ESPN_EARLIEST_SEASON",
  "ESPN_S2",
  "ESPN_SWID",
].every((name) => process.env[name]?.trim());

describe.skipIf(!hasLiveConfiguration)("season CLI live integration", () => {
  it("imports the earliest season into temporary storage", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-cli-import-"),
    );
    const database = createLibSqlDatabaseProvider({
      url: `file:${join(directory, "database.db")}`,
      migrationsDirectory: resolve(process.cwd(), "migrations"),
    });
    const source = new EspnFantasySource({
      leagueId: Number(process.env.ESPN_LEAGUE_ID),
      earliestSeason: Number(process.env.ESPN_EARLIEST_SEASON),
      espnS2: process.env.ESPN_S2!,
      swid: process.env.ESPN_SWID!,
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    try {
      const exitCode = await runSeasonCli(
        ["import", "--year", process.env.ESPN_EARLIEST_SEASON!],
        () => ({
          database,
          service: new SeasonImportService({ database, source }),
          close() {},
        }),
        { stdout, stderr },
      );

      expect(exitCode).toBe(0);
      expect(stdout).toHaveBeenCalledWith(
        expect.stringMatching(/^Season \d{4} import succeeded \(run .+\)$/),
      );
      expect(stderr).not.toHaveBeenCalled();
    } finally {
      database.close();
      await rm(directory, { recursive: true });
    }
  });
});
