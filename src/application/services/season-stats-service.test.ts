import { describe, expect, it, vi } from "vitest";

import { SeasonStatsService } from "./season-stats-service";

describe("SeasonStatsService", () => {
  it("returns null without running derived queries for a missing season", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue(null),
      listSeasonStandings: vi.fn(),
      listWeeklyTeamResults: vi.fn(),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toBeNull();
    expect(database.listSeasonStandings).not.toHaveBeenCalled();
    expect(database.listWeeklyTeamResults).not.toHaveBeenCalled();
  });

  it("combines season metadata with derived scoring results", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue({
        season: {
          year: 2025,
          teamCount: 12,
          regularSeasonStartWeek: 1,
          regularSeasonEndWeek: 14,
        },
      }),
      listSeasonStandings: vi.fn().mockResolvedValue([{ qualificationRank: 1 }]),
      listWeeklyTeamResults: vi.fn().mockResolvedValue([{ week: 1 }]),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toEqual({
      year: 2025,
      teamCount: 12,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 14,
      standings: [{ qualificationRank: 1 }],
      weeklyResults: [{ week: 1 }],
    });
  });
});
