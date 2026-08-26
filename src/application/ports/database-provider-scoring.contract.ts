import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DatabaseProvider } from "./database-provider";
import type { SeasonImportSnapshot } from "@/domain/types";

interface DatabaseProviderHarness {
  provider: DatabaseProvider;
  cleanup(): Promise<void>;
}

interface ScoringContractOptions {
  name: string;
  createHarness(): Promise<DatabaseProviderHarness>;
}

const ids = {
  league: "10000000-0000-4000-8000-000000000001",
  season: "10000000-0000-4000-8000-000000000002",
  importRun: "10000000-0000-4000-8000-000000000003",
  refreshRun: "10000000-0000-4000-8000-000000000004",
  override: "10000000-0000-4000-8000-000000000005",
  franchises: Array.from(
    { length: 6 },
    (_, index) =>
      `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ),
  matchups: Array.from(
    { length: 15 },
    (_, index) =>
      `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ),
};

const weekDefinitions = [
  { week: 1, phase: "regular", scores: [10, 20, 30, 40, 50, 60] },
  { week: 2, phase: "regular", scores: [10, 20, 30, 30, 50, 60] },
  { week: 3, phase: "regular", scores: [10, 20, 40, 40, 40, 60] },
  { week: 4, phase: "playoff", scores: [60, 20, 30, 40, 50, 10] },
  { week: 5, phase: "consolation", scores: [60, 20, 30, 40, 50, 10] },
] as const;

const matchupPairs = [
  [0, 5],
  [1, 4],
  [2, 3],
] as const;

function createScoringSnapshot(): SeasonImportSnapshot {
  const matchups: SeasonImportSnapshot["matchups"] = [];
  const scores: SeasonImportSnapshot["scores"] = [];

  weekDefinitions.forEach((definition, weekIndex) => {
    matchupPairs.forEach(([homeIndex, awayIndex], matchupIndex) => {
      const matchupId =
        ids.matchups[weekIndex * matchupPairs.length + matchupIndex];

      matchups.push({
        id: matchupId,
        seasonId: ids.season,
        week: definition.week,
        phase: definition.phase,
        homeFranchiseId: ids.franchises[homeIndex],
        awayFranchiseId: ids.franchises[awayIndex],
      });
      scores.push(
        {
          matchupId,
          franchiseId: ids.franchises[homeIndex],
          score: definition.scores[homeIndex],
        },
        {
          matchupId,
          franchiseId: ids.franchises[awayIndex],
          score: definition.scores[awayIndex],
        },
      );
    });
  });

  return {
    league: {
      id: ids.league,
      name: "Scoring Contract League",
    },
    season: {
      id: ids.season,
      leagueId: ids.league,
      year: 2025,
      teamCount: 6,
      playoffTeamCount: 4,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 3,
    },
    franchises: ids.franchises.map((id, index) => ({
      id,
      leagueId: ids.league,
      ownerName: `Owner ${index + 1}`,
    })),
    franchiseNames: ids.franchises.map((franchiseId, index) => ({
      franchiseId,
      name: `Team ${index + 1}`,
    })),
    seasonFranchiseNames: ids.franchises.map(
      (franchiseId, index) => ({
        franchiseId,
        name: `Team ${index + 1}`,
      }),
    ),
    matchups,
    scores,
    sourceMappings: [
      {
        provider: "synthetic",
        entityType: "league",
        canonicalId: ids.league,
        externalId: "league",
      },
      {
        provider: "synthetic",
        entityType: "season",
        canonicalId: ids.season,
        externalId: "2025",
      },
    ],
  };
}

async function saveScoreAdjustment(provider: DatabaseProvider) {
  await provider.saveMatchupOverride({
    id: ids.override,
    matchupId: ids.matchups[0],
    franchiseId: ids.franchises[0],
    scoreAdjustment: 55,
    reason: "Scoring contract adjustment",
    createdAt: "2026-08-23T23:00:00Z",
  });
}

async function refreshAdjustedScore(provider: DatabaseProvider) {
  const snapshot = createScoringSnapshot();
  const score = snapshot.scores.find(
    (candidate) =>
      candidate.matchupId === ids.matchups[0] &&
      candidate.franchiseId === ids.franchises[0],
  );

  if (!score) {
    throw new Error("Scoring contract fixture is missing its adjusted score");
  }

  score.score = 12;
  await provider.startImportRun({
    id: ids.refreshRun,
    provider: "synthetic",
    operation: "refresh",
    seasonYear: 2025,
    startedAt: "2026-08-23T23:02:00Z",
  });
  await provider.commitSeasonImport({
    importRunId: ids.refreshRun,
    snapshot,
    completedAt: "2026-08-23T23:03:00Z",
  });
}

export function defineDatabaseProviderScoringContract(
  options: ScoringContractOptions,
) {
  describe(`${options.name} scoring contract`, () => {
    let harness: DatabaseProviderHarness;

    beforeEach(async () => {
      harness = await options.createHarness();
      await harness.provider.runMigrations();
      await harness.provider.startImportRun({
        id: ids.importRun,
        provider: "synthetic",
        operation: "import",
        seasonYear: 2025,
        startedAt: "2026-08-23T22:00:00Z",
      });
      await harness.provider.commitSeasonImport({
        importRunId: ids.importRun,
        snapshot: createScoringSnapshot(),
        completedAt: "2026-08-23T22:01:00Z",
      });
    });

    afterEach(async () => {
      await harness.cleanup();
    });

    it("ranks normal weekly scores from one through the team count", async () => {
      const result = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT
            franchise_id,
            nascar_points,
            head_to_head_bonus,
            adjusted_nascar_points
          FROM weekly_adjusted_nascar_points
          WHERE season_year = ? AND week = 1
          ORDER BY nascar_points
        `,
        parameters: [2025],
      });

      expect(result.rows[0]).toEqual({
        franchise_id: ids.franchises[0],
        nascar_points: 1,
        head_to_head_bonus: 0,
        adjusted_nascar_points: 1,
      });
      expect(result.rows.map((row) => row.nascar_points)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      expect(result.rows.at(-1)).toEqual({
        franchise_id: ids.franchises[5],
        nascar_points: 6,
        head_to_head_bonus: 6,
        adjusted_nascar_points: 12,
      });
    });

    it("averages two-way and three-way NP ties", async () => {
      const twoWayTie = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT
            franchise_id,
            nascar_points,
            head_to_head_bonus,
            adjusted_nascar_points
          FROM weekly_adjusted_nascar_points
          WHERE season_year = 2025
            AND week = 2
            AND franchise_id IN (?, ?)
          ORDER BY franchise_id
        `,
        parameters: [ids.franchises[2], ids.franchises[3]],
      });
      const threeWayTie = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT franchise_id, nascar_points
          FROM weekly_nascar_points
          WHERE season_year = 2025
            AND week = 3
            AND franchise_id IN (?, ?, ?)
          ORDER BY franchise_id
        `,
        parameters: [
          ids.franchises[2],
          ids.franchises[3],
          ids.franchises[4],
        ],
      });

      expect(twoWayTie.rows).toEqual([
        {
          franchise_id: ids.franchises[2],
          nascar_points: 3.5,
          head_to_head_bonus: 3,
          adjusted_nascar_points: 6.5,
        },
        {
          franchise_id: ids.franchises[3],
          nascar_points: 3.5,
          head_to_head_bonus: 3,
          adjusted_nascar_points: 6.5,
        },
      ]);
      expect(threeWayTie.rows).toEqual([
        { franchise_id: ids.franchises[2], nascar_points: 4 },
        { franchise_id: ids.franchises[3], nascar_points: 4 },
        { franchise_id: ids.franchises[4], nascar_points: 4 },
      ]);
    });

    it("applies adjustments and preserves them across score refreshes", async () => {
      await saveScoreAdjustment(harness.provider);

      await expect(
        harness.provider.executeReadOnlyQuery({
          statement: `
            SELECT
              imported_score,
              score_adjustment,
              effective_score,
              nascar_points,
              head_to_head_bonus,
              adjusted_nascar_points
            FROM weekly_adjusted_nascar_points
            WHERE matchup_id = ? AND franchise_id = ?
          `,
          parameters: [ids.matchups[0], ids.franchises[0]],
        }),
      ).resolves.toEqual({
        columns: [
          "imported_score",
          "score_adjustment",
          "effective_score",
          "nascar_points",
          "head_to_head_bonus",
          "adjusted_nascar_points",
        ],
        rows: [
          {
            imported_score: 10,
            score_adjustment: 55,
            effective_score: 65,
            nascar_points: 6,
            head_to_head_bonus: 6,
            adjusted_nascar_points: 12,
          },
        ],
      });

      await refreshAdjustedScore(harness.provider);

      const refreshed = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT imported_score, score_adjustment, effective_score
          FROM effective_matchup_scores
          WHERE matchup_id = ? AND franchise_id = ?
        `,
        parameters: [ids.matchups[0], ids.franchises[0]],
      });

      expect(refreshed.rows).toEqual([
        {
          imported_score: 12,
          score_adjustment: 55,
          effective_score: 67,
        },
      ]);
      await expect(
        harness.provider.listMatchupOverrides(ids.season),
      ).resolves.toHaveLength(1);
    });

    it("excludes playoff and consolation weeks from qualification totals", async () => {
      await saveScoreAdjustment(harness.provider);
      await refreshAdjustedScore(harness.provider);

      const standings = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT
            weeks_played,
            total_adjusted_nascar_points,
            qualification_rank
          FROM regular_season_anp_standings
          WHERE season_year = 2025 AND franchise_id = ?
        `,
        parameters: [ids.franchises[0]],
      });
      const allWeeks = await harness.provider.executeReadOnlyQuery({
        statement: `
          SELECT SUM(adjusted_nascar_points) AS total
          FROM weekly_adjusted_nascar_points
          WHERE season_year = 2025 AND franchise_id = ?
        `,
        parameters: [ids.franchises[0]],
      });

      expect(standings.rows).toEqual([
        {
          weeks_played: 3,
          total_adjusted_nascar_points: 14,
          qualification_rank: 5,
        },
      ]);
      expect(allWeeks.rows).toEqual([{ total: 38 }]);
    });
  });
}
