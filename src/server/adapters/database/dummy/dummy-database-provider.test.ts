import { describe, expect, it } from "vitest";

import type { SeasonImportSnapshot } from "@/domain/types";

import {
  DummyDatabaseProvider,
  UnsupportedDummyStorageOperationError,
} from "./dummy-database-provider";

const ids = {
  league: "10000000-0000-4000-8000-000000000001",
  season: "10000000-0000-4000-8000-000000000002",
  home: "10000000-0000-4000-8000-000000000003",
  away: "10000000-0000-4000-8000-000000000004",
  matchup: "10000000-0000-4000-8000-000000000005",
  importRun: "10000000-0000-4000-8000-000000000006",
  override: "10000000-0000-4000-8000-000000000007",
};

function createSnapshot(): SeasonImportSnapshot {
  return {
    league: { id: ids.league, name: "Dummy League" },
    season: {
      id: ids.season,
      leagueId: ids.league,
      year: 2025,
      teamCount: 2,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 1,
    },
    franchises: [
      { id: ids.home, leagueId: ids.league, ownerName: null },
      { id: ids.away, leagueId: ids.league, ownerName: null },
    ],
    franchiseNames: [
      { franchiseId: ids.home, name: "Home Team" },
      { franchiseId: ids.away, name: "Away Team" },
    ],
    matchups: [
      {
        id: ids.matchup,
        seasonId: ids.season,
        week: 1,
        phase: "regular",
        homeFranchiseId: ids.home,
        awayFranchiseId: ids.away,
      },
    ],
    scores: [
      { matchupId: ids.matchup, franchiseId: ids.home, score: 100 },
      { matchupId: ids.matchup, franchiseId: ids.away, score: 90 },
    ],
    sourceMappings: [
      {
        provider: "espn",
        entityType: "league",
        canonicalId: ids.league,
        externalId: "league-1",
      },
    ],
  };
}

describe("DummyDatabaseProvider", () => {
  it("supports the season import workflow in memory", async () => {
    const provider = new DummyDatabaseProvider();
    await provider.startImportRun({
      id: ids.importRun,
      provider: "espn",
      operation: "import",
      seasonYear: 2025,
      startedAt: "2026-08-23T22:00:00Z",
    });

    await expect(
      provider.commitSeasonImport({
        importRunId: ids.importRun,
        snapshot: createSnapshot(),
        completedAt: "2026-08-23T22:01:00Z",
      }),
    ).resolves.toMatchObject({ status: "succeeded" });
    await expect(provider.getSeasonImportSnapshot(2025)).resolves.toEqual(
      createSnapshot(),
    );
    await expect(provider.listSourceMappings("espn")).resolves.toHaveLength(
      1,
    );
    await expect(provider.listImportRuns()).resolves.toEqual([
      expect.objectContaining({
        id: ids.importRun,
        status: "succeeded",
      }),
    ]);
  });

  it("supports typed matchup overrides", async () => {
    const provider = new DummyDatabaseProvider();
    await provider.startImportRun({
      id: ids.importRun,
      provider: "espn",
      operation: "import",
      seasonYear: 2025,
      startedAt: "2026-08-23T22:00:00Z",
    });
    await provider.commitSeasonImport({
      importRunId: ids.importRun,
      snapshot: createSnapshot(),
      completedAt: "2026-08-23T22:01:00Z",
    });
    const matchupOverride = {
      id: ids.override,
      matchupId: ids.matchup,
      franchiseId: ids.home,
      scoreAdjustment: 1.25,
      reason: "Dummy correction",
      createdAt: "2026-08-23T22:02:00Z",
    };

    await expect(
      provider.saveMatchupOverride(matchupOverride),
    ).resolves.toEqual(matchupOverride);
    await expect(
      provider.listMatchupOverrides(ids.season),
    ).resolves.toEqual([matchupOverride]);
  });

  it("rejects unsupported arbitrary SQL explicitly", async () => {
    const provider = new DummyDatabaseProvider();

    await expect(
      provider.executeReadOnlyQuery({ statement: "SELECT 1" }),
    ).rejects.toThrow(UnsupportedDummyStorageOperationError);
    await expect(provider.listSeasonStandings(2025)).rejects.toThrow(
      "Dummy storage does not support season standings",
    );
  });
});
