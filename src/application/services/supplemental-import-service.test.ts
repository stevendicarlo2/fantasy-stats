import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SeasonImportSnapshot } from "@/domain/types";

import { SupplementalImportService } from "./supplemental-import-service";

const ids = {
  league: "10000000-0000-4000-8000-000000000001",
  season: "10000000-0000-4000-8000-000000000002",
  run: "10000000-0000-4000-8000-000000000003",
};

function coreSnapshot(year = 2025): SeasonImportSnapshot {
  return {
    league: { id: ids.league, name: "League" },
    season: {
      id: ids.season,
      leagueId: ids.league,
      year,
      teamCount: 2,
      playoffTeamCount: 1,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 1,
    },
    franchises: [],
    franchiseNames: [],
    seasonFranchiseNames: [],
    matchups: [],
    matchupScoringPeriods: [],
    scores: [],
    sourceMappings: [],
  };
}

describe("SupplementalImportService", () => {
  const database = {
    getSeasonImportSnapshot: vi.fn(),
    listRelevantPlayers: vi.fn().mockResolvedValue([]),
    listSourceMappings: vi.fn().mockResolvedValue([]),
    startImportRun: vi.fn().mockImplementation(async (input) => ({
      ...input,
      status: "running",
      completedAt: null,
      errorMessage: null,
    })),
    commitRosterImport: vi.fn(),
    commitTransactionImport: vi.fn(),
    commitPlayerStatsImport: vi.fn(),
    markImportUnavailable: vi.fn().mockImplementation(async (input) => ({
      id: input.importRunId,
      provider: "espn",
      operation: "refresh",
      dataset: "rosters",
      seasonYear: 2017,
      status: "unavailable",
      startedAt: "2026-09-07T12:00:00.000Z",
      completedAt: input.completedAt,
      errorMessage: input.reason,
    })),
    failImportRun: vi.fn(),
  };
  const rosterSource = {
    provider: "espn",
    fetchRosters: vi.fn(),
  };
  const transactionSource = {
    provider: "espn",
    fetchTransactions: vi.fn(),
  };
  const nflSource = {
    provider: "espn",
    fetchPlayerStats: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records provider-unavailable historical rosters", async () => {
    database.getSeasonImportSnapshot.mockResolvedValue(coreSnapshot(2017));
    rosterSource.fetchRosters.mockResolvedValue({
      availability: "unavailable",
      reason: "Historical weekly rosters are unavailable before 2018",
    });
    const service = new SupplementalImportService({
      database,
      rosterSource,
      transactionSource,
      nflSource,
      createId: () => ids.run,
      now: () => new Date("2026-09-07T12:00:00.000Z"),
    });

    await service.importRosters(2017);

    expect(database.startImportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "rosters",
        seasonYear: 2017,
      }),
    );
    expect(database.markImportUnavailable).toHaveBeenCalledWith({
      importRunId: ids.run,
      completedAt: "2026-09-07T12:00:00.000Z",
      reason: "Historical weekly rosters are unavailable before 2018",
    });
    expect(database.commitRosterImport).not.toHaveBeenCalled();
  });

  it("uses core matchup scoring periods for public player stats", async () => {
    database.getSeasonImportSnapshot.mockResolvedValue({
      ...coreSnapshot(),
      matchupScoringPeriods: [
        {
          matchupId: "10000000-0000-4000-8000-000000000004",
          scoringPeriod: 1,
        },
        {
          matchupId: "10000000-0000-4000-8000-000000000004",
          scoringPeriod: 2,
        },
      ],
    });
    database.listRelevantPlayers.mockResolvedValue([
      { id: "10000000-0000-4000-8000-000000000005", externalId: "101" },
    ]);
    nflSource.fetchPlayerStats.mockResolvedValue({
      seasonYear: 2025,
      nflTeams: [],
      games: [],
      playerStats: [],
      sourceMappings: [],
    });
    database.commitPlayerStatsImport.mockResolvedValue({
      id: ids.run,
      provider: "espn",
      operation: "refresh",
      dataset: "player_stats",
      seasonYear: 2025,
      status: "succeeded",
      startedAt: "2026-09-07T12:00:00.000Z",
      completedAt: "2026-09-07T12:00:00.000Z",
      errorMessage: null,
    });
    const service = new SupplementalImportService({
      database,
      rosterSource,
      transactionSource,
      nflSource,
      createId: () => ids.run,
      now: () => new Date("2026-09-07T12:00:00.000Z"),
    });

    await service.importPlayerStats(2025);

    expect(nflSource.fetchPlayerStats).toHaveBeenCalledWith({
      year: 2025,
      scoringPeriods: [1, 2],
      relevantPlayers: [
        {
          id: "10000000-0000-4000-8000-000000000005",
          externalId: "101",
        },
      ],
      knownMappings: [],
    });
  });
});
