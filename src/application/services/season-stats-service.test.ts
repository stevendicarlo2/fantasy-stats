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
      listWeeklyTeamResults: vi.fn().mockResolvedValue([
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "home",
          week: 1,
          phase: "regular",
        },
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "away",
          week: 1,
          phase: "regular",
        },
      ]),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toEqual({
      year: 2025,
      teamCount: 12,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 14,
      standings: [{ qualificationRank: 1 }],
      matchups: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          week: 1,
          phase: "regular",
          home: expect.objectContaining({ matchupSide: "home" }),
          away: expect.objectContaining({ matchupSide: "away" }),
        },
      ],
    });
  });

  it("rejects derived results without a home team", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue({
        season: {
          year: 2025,
          teamCount: 2,
          regularSeasonStartWeek: 1,
          regularSeasonEndWeek: 1,
        },
      }),
      listSeasonStandings: vi.fn().mockResolvedValue([]),
      listWeeklyTeamResults: vi.fn().mockResolvedValue([
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "away",
          week: 1,
          phase: "regular",
        },
      ]),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).rejects.toThrow(
      "has inconsistent team results",
    );
  });
});
