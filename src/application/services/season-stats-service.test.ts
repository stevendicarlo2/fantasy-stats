import { describe, expect, it, vi } from "vitest";

import { SeasonStatsService } from "./season-stats-service";

describe("SeasonStatsService", () => {
  it("returns null without running derived queries for a missing season", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue(null),
      listImportedSeasonYears: vi.fn(),
      listWeeklyTeamResults: vi.fn(),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toBeNull();
    expect(database.listWeeklyTeamResults).not.toHaveBeenCalled();
  });

  it("combines season metadata with derived scoring results", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue({
        season: {
          year: 2025,
          teamCount: 12,
          playoffTeamCount: 6,
          regularSeasonStartWeek: 1,
          regularSeasonEndWeek: 14,
        },
      }),
      listImportedSeasonYears: vi.fn(),
      listWeeklyTeamResults: vi.fn().mockResolvedValue([
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "home",
          week: 1,
          phase: "regular",
          franchiseId: "22222222-2222-4222-8222-222222222222",
          displayName: "Person One",
          teamName: "Team One",
          ownerName: null,
          effectiveScore: 101,
          nascarPoints: 2,
          headToHeadBonus: 2,
          adjustedNascarPoints: 4,
        },
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "away",
          week: 1,
          phase: "regular",
          franchiseId: "33333333-3333-4333-8333-333333333333",
          displayName: "Person Two",
          teamName: "Team Two",
          ownerName: null,
          effectiveScore: 99,
          nascarPoints: 1,
          headToHeadBonus: 0,
          adjustedNascarPoints: 1,
        },
      ]),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toEqual({
      year: 2025,
      teamCount: 12,
      playoffTeamCount: 6,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 14,
      matchups: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          week: 1,
          phase: "regular",
          home: expect.objectContaining({ matchupSide: "home" }),
          away: expect.objectContaining({ matchupSide: "away" }),
        },
      ],
      analytics: [
        expect.objectContaining({
          franchiseId: "22222222-2222-4222-8222-222222222222",
          opponentFranchiseId:
            "33333333-3333-4333-8333-333333333333",
          week: 1,
          team: { score: 101, np: 2, anp: 4 },
          opponent: { score: 99, np: 1, anp: 1 },
        }),
        expect.objectContaining({
          franchiseId: "33333333-3333-4333-8333-333333333333",
          opponentFranchiseId:
            "22222222-2222-4222-8222-222222222222",
          week: 1,
          team: { score: 99, np: 1, anp: 1 },
          opponent: { score: 101, np: 2, anp: 4 },
        }),
      ],
    });
  });

  it("rejects derived results without a home team", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue({
        season: {
          year: 2025,
          teamCount: 2,
          playoffTeamCount: 1,
          regularSeasonStartWeek: 1,
          regularSeasonEndWeek: 1,
        },
      }),
      listImportedSeasonYears: vi.fn(),
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

  it("excludes postseason results from analytics", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn().mockResolvedValue({
        season: {
          year: 2025,
          teamCount: 2,
          playoffTeamCount: 1,
          regularSeasonStartWeek: 1,
          regularSeasonEndWeek: 1,
        },
      }),
      listImportedSeasonYears: vi.fn(),
      listWeeklyTeamResults: vi.fn().mockResolvedValue([
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "home",
          week: 2,
          phase: "playoff",
          franchiseId: "22222222-2222-4222-8222-222222222222",
          displayName: "Person One",
          teamName: "Team One",
          ownerName: null,
          effectiveScore: 101,
          nascarPoints: 2,
          headToHeadBonus: 2,
          adjustedNascarPoints: 4,
        },
        {
          matchupId: "11111111-1111-4111-8111-111111111111",
          matchupSide: "away",
          week: 2,
          phase: "playoff",
          franchiseId: "33333333-3333-4333-8333-333333333333",
          displayName: "Person Two",
          teamName: "Team Two",
          ownerName: null,
          effectiveScore: 99,
          nascarPoints: 1,
          headToHeadBonus: 0,
          adjustedNascarPoints: 1,
        },
      ]),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getSeasonStats(2025)).resolves.toMatchObject({
      analytics: [],
      matchups: [expect.objectContaining({ phase: "playoff" })],
    });
  });

  it("lists imported seasons for overview navigation", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn(),
      listImportedSeasonYears: vi
        .fn()
        .mockResolvedValue([2025, 2023, 2021]),
      listWeeklyTeamResults: vi.fn(),
    };
    const service = new SeasonStatsService(database);

    await expect(service.getAvailableSeasonYears()).resolves.toEqual([
      2025, 2023, 2021,
    ]);
  });
});
