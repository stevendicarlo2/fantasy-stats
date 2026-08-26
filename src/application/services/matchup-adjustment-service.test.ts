import { describe, expect, it, vi } from "vitest";

import { MatchupAdjustmentService } from "./matchup-adjustment-service";
import type { SeasonImportSnapshot } from "@/domain/types";

const ids = {
  season: "11111111-1111-4111-8111-111111111111",
  matchup: "22222222-2222-4222-8222-222222222222",
  home: "33333333-3333-4333-8333-333333333333",
  away: "44444444-4444-4444-8444-444444444444",
  override: "55555555-5555-4555-8555-555555555555",
};

function createSnapshot(): SeasonImportSnapshot {
  return {
    league: {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Synthetic League",
    },
    season: {
      id: ids.season,
      leagueId: "66666666-6666-4666-8666-666666666666",
      year: 2025,
      teamCount: 2,
      playoffTeamCount: 1,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 1,
    },
    franchises: [],
    franchiseNames: [],
    seasonFranchiseNames: [],
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
      { matchupId: ids.matchup, franchiseId: ids.away, score: 99 },
    ],
    sourceMappings: [],
  };
}

function createDatabase() {
  return {
    getSeasonImportSnapshot: vi.fn().mockResolvedValue(createSnapshot()),
    listMatchupOverrides: vi.fn().mockResolvedValue([]),
    saveMatchupOverride: vi.fn(async (matchupOverride) => matchupOverride),
    deleteMatchupOverride: vi.fn().mockResolvedValue(true),
  };
}

describe("MatchupAdjustmentService", () => {
  it("creates a validated additive score adjustment", async () => {
    const database = createDatabase();
    const service = new MatchupAdjustmentService({
      database,
      createId: () => ids.override,
      now: () => new Date("2026-08-24T20:00:00Z"),
    });

    await expect(
      service.saveAdjustment({
        seasonYear: 2025,
        matchupId: ids.matchup,
        franchiseId: ids.home,
        scoreAdjustment: -1.25,
        reason: "Stat correction",
      }),
    ).resolves.toEqual({
      id: ids.override,
      matchupId: ids.matchup,
      franchiseId: ids.home,
      scoreAdjustment: -1.25,
      reason: "Stat correction",
      createdAt: "2026-08-24T20:00:00.000Z",
    });
  });

  it("reuses the existing override identity when editing a target", async () => {
    const database = createDatabase();
    database.listMatchupOverrides.mockResolvedValue([
      {
        id: ids.override,
        matchupId: ids.matchup,
        franchiseId: ids.home,
        scoreAdjustment: 1,
        reason: "Original",
        createdAt: "2026-08-24T19:00:00.000Z",
      },
    ]);
    const service = new MatchupAdjustmentService({ database });

    await service.saveAdjustment({
      seasonYear: 2025,
      matchupId: ids.matchup,
      franchiseId: ids.home,
      scoreAdjustment: 2,
      reason: "Updated",
    });

    expect(database.saveMatchupOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ids.override,
        scoreAdjustment: 2,
        createdAt: "2026-08-24T19:00:00.000Z",
      }),
    );
  });

  it("rejects targets outside the imported matchup", async () => {
    const service = new MatchupAdjustmentService({
      database: createDatabase(),
    });

    await expect(
      service.saveAdjustment({
        seasonYear: 2025,
        matchupId: ids.matchup,
        franchiseId: ids.override,
        scoreAdjustment: 1,
        reason: "Invalid",
      }),
    ).rejects.toThrow(
      "The adjustment must target a franchise in the selected matchup",
    );
  });

  it("verifies an adjustment belongs to the season before deleting it", async () => {
    const database = createDatabase();
    const service = new MatchupAdjustmentService({ database });

    await expect(
      service.deleteAdjustment(2025, ids.override),
    ).rejects.toThrow("The selected matchup adjustment was not found");
    expect(database.deleteMatchupOverride).not.toHaveBeenCalled();
  });
});
