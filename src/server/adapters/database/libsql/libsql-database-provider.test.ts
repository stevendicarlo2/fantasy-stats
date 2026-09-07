import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CloseableDatabaseProvider } from "./libsql-database-provider";
import {
  createLibSqlDatabaseProvider,
  LibSqlDatabaseError,
} from "./libsql-database-provider";
import type { SeasonImportSnapshot } from "@/domain/types";

const ids = {
  league: "11111111-1111-4111-8111-111111111111",
  season: "22222222-2222-4222-8222-222222222222",
  home: "33333333-3333-4333-8333-333333333333",
  away: "44444444-4444-4444-8444-444444444444",
  matchup: "55555555-5555-4555-8555-555555555555",
  override: "66666666-6666-4666-8666-666666666666",
  importRun: "77777777-7777-4777-8777-777777777777",
  refreshRun: "88888888-8888-4888-8888-888888888888",
  failedRun: "99999999-9999-4999-8999-999999999999",
  otherLeague: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherSeason: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  player: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  defense: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  nflTeam: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  awayNflTeam: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  rosterRun: "f1111111-1111-4111-8111-111111111111",
  transactionRun: "f2222222-2222-4222-8222-222222222222",
  draftPick: "f3333333-3333-4333-8333-333333333333",
  transaction: "f4444444-4444-4444-8444-444444444444",
  game: "f5555555-5555-4555-8555-555555555555",
  playerStatsRun: "f6666666-6666-4666-8666-666666666666",
};

function createSnapshot(): SeasonImportSnapshot {
  return {
    league: {
      id: ids.league,
      name: "Synthetic League",
    },
    season: {
      id: ids.season,
      leagueId: ids.league,
      year: 2025,
      teamCount: 2,
      playoffTeamCount: 1,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 14,
    },
    franchises: [
      { id: ids.home, leagueId: ids.league, ownerName: "Owner One" },
      { id: ids.away, leagueId: ids.league, ownerName: null },
    ],
    franchiseNames: [
      { franchiseId: ids.home, name: "Home Team" },
      { franchiseId: ids.home, name: "Historical Home Team" },
      { franchiseId: ids.away, name: "Away Team" },
    ],
    seasonFranchiseNames: [
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
      { matchupId: ids.matchup, franchiseId: ids.home, score: 101.25 },
      { matchupId: ids.matchup, franchiseId: ids.away, score: 99.75 },
    ],
    sourceMappings: [
      {
        provider: "espn",
        entityType: "league",
        canonicalId: ids.league,
        externalId: "league-1",
      },
      {
        provider: "espn",
        entityType: "season",
        canonicalId: ids.season,
        externalId: "2025",
      },
      {
        provider: "espn",
        entityType: "franchise",
        canonicalId: ids.home,
        externalId: "team-1",
      },
      {
        provider: "espn",
        entityType: "franchise",
        canonicalId: ids.away,
        externalId: "team-2",
      },
      {
        provider: "espn",
        entityType: "matchup",
        canonicalId: ids.matchup,
        externalId: "week-1-matchup-1",
      },
    ],
  };
}

describe("libSQL database provider", () => {
  let provider: CloseableDatabaseProvider;
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-provider-"),
    );
    provider = createLibSqlDatabaseProvider({
      url: `file:${join(temporaryDirectory, "database.db")}`,
      migrationsDirectory: resolve(process.cwd(), "migrations"),
    });
  });

  afterEach(async () => {
    provider.close();
    await rm(temporaryDirectory, { recursive: true });
  });

  async function importSnapshot(
    snapshot = createSnapshot(),
    importRunId = ids.importRun,
    operation: "import" | "refresh" = "import",
  ) {
    await provider.startImportRun({
      id: importRunId,
      provider: "espn",
      operation,
      seasonYear: snapshot.season.year,
      startedAt: "2026-08-23T23:00:00Z",
    });

    return provider.commitSeasonImport({
      importRunId,
      snapshot,
      completedAt: "2026-08-23T23:01:00Z",
    });
  }

  it("applies the canonical schema migration idempotently", async () => {
    await expect(provider.runMigrations()).resolves.toEqual({
      appliedMigrations: [
        "0001_initial_schema.sql",
        "0002_scoring_views.sql",
        "0003_support_postseason_byes.sql",
        "0004_scoring_views_with_byes.sql",
        "0005_franchise_display_names.sql",
        "0006_season_franchise_names.sql",
        "0007_season_playoff_team_count.sql",
        "0008_matchup_roster_data.sql",
        "0009_rename_nfl_game_type.sql",
      ],
    });
    await expect(provider.runMigrations()).resolves.toEqual({
      appliedMigrations: [],
    });
  });

  it("persists and reconstructs a canonical season snapshot", async () => {
    await provider.runMigrations();
    await expect(importSnapshot()).resolves.toMatchObject({
      id: ids.importRun,
      status: "succeeded",
    });
    const storedSnapshot = await provider.getSeasonImportSnapshot(2025);
    const expectedSnapshot = createSnapshot();
    expect(storedSnapshot).toMatchObject({
      ...expectedSnapshot,
      franchiseNames: expect.arrayContaining(
        expectedSnapshot.franchiseNames,
      ),
      sourceMappings: expect.arrayContaining(
        expectedSnapshot.sourceMappings,
      ),
    });
    expect(storedSnapshot?.franchiseNames).toHaveLength(
      expectedSnapshot.franchiseNames.length,
    );
    await expect(provider.hasSeasonImport(2025)).resolves.toBe(true);
    await expect(provider.hasSeasonImport(2024)).resolves.toBe(false);
    await expect(provider.listImportedSeasonYears()).resolves.toEqual([
      2025,
    ]);
    expect(storedSnapshot?.sourceMappings).toHaveLength(5);
    await expect(provider.listSourceMappings("espn")).resolves.toHaveLength(5);
  });

  it("persists independent roster, transaction, and player-stat datasets", async () => {
      await provider.runMigrations();
      await importSnapshot();
      await provider.startImportRun({
        id: ids.rosterRun,
        provider: "espn",
        operation: "import",
        dataset: "rosters",
        seasonYear: 2025,
        startedAt: "2026-08-23T23:02:00Z",
      });
      await provider.commitRosterImport({
        importRunId: ids.rosterRun,
        completedAt: "2026-08-23T23:03:00Z",
        snapshot: {
          seasonId: ids.season,
          seasonYear: 2025,
          players: [
            {
              id: ids.player,
              kind: "athlete",
              displayName: "Synthetic Player",
              firstName: "Synthetic",
              lastName: "Player",
            },
            {
              id: ids.defense,
              kind: "team_defense",
              displayName: "Synthetic D/ST",
              firstName: null,
              lastName: null,
            },
          ],
          nflTeams: [
            {
              id: ids.nflTeam,
              abbreviation: "SYN",
              displayName: "Synthetic Team",
            },
            {
              id: ids.awayNflTeam,
              abbreviation: "AWY",
              displayName: "Away NFL Team",
            },
          ],
          rosters: [
            {
              seasonId: ids.season,
              scoringPeriod: 1,
              franchiseId: ids.home,
              state: "final",
            },
            {
              seasonId: ids.season,
              scoringPeriod: 1,
              franchiseId: ids.away,
              state: "final",
            },
          ],
          entries: [
            {
              seasonId: ids.season,
              scoringPeriod: 1,
              franchiseId: ids.home,
              playerId: ids.player,
              lineupSlot: "QB",
              rosterOrder: 0,
              actualFantasyPoints: 20.5,
              projectedFantasyPoints: 18.25,
            },
            {
              seasonId: ids.season,
              scoringPeriod: 1,
              franchiseId: ids.away,
              playerId: ids.defense,
              lineupSlot: "DST",
              rosterOrder: 0,
              actualFantasyPoints: 8,
              projectedFantasyPoints: null,
            },
          ],
          nflTeamRanges: [
            {
              playerId: ids.player,
              seasonId: ids.season,
              nflTeamId: ids.nflTeam,
              startScoringPeriod: 1,
              endScoringPeriod: 1,
            },
          ],
          positionRanges: [
            {
              playerId: ids.player,
              seasonId: ids.season,
              position: "QB",
              startScoringPeriod: 1,
              endScoringPeriod: 1,
            },
            {
              playerId: ids.defense,
              seasonId: ids.season,
              position: "DST",
              startScoringPeriod: 1,
              endScoringPeriod: 1,
            },
          ],
          sourceMappings: [
            {
              provider: "espn",
              entityType: "player",
              canonicalId: ids.player,
              externalId: "101",
            },
            {
              provider: "espn",
              entityType: "player",
              canonicalId: ids.defense,
              externalId: "team-defense:1",
            },
            {
              provider: "espn",
              entityType: "nfl_team",
              canonicalId: ids.nflTeam,
              externalId: "1",
            },
          ],
        },
      });
      await provider.startImportRun({
        id: ids.transactionRun,
        provider: "espn",
        operation: "import",
        dataset: "transactions",
        seasonYear: 2025,
        startedAt: "2026-08-23T23:04:00Z",
      });
      await provider.commitTransactionImport({
        importRunId: ids.transactionRun,
        completedAt: "2026-08-23T23:05:00Z",
        snapshot: {
          seasonId: ids.season,
          seasonYear: 2025,
          players: [
            {
              id: ids.player,
              kind: "athlete",
              displayName: "Synthetic Player",
              firstName: "Synthetic",
              lastName: "Player",
            },
          ],
          nflTeams: [],
          draftPicks: [
            {
              id: ids.draftPick,
              seasonId: ids.season,
              franchiseId: ids.home,
              playerId: ids.player,
              round: 1,
              roundPick: 1,
              overallPick: 1,
              keeper: false,
              auctionBid: null,
            },
          ],
          transactions: [
            {
              id: ids.transaction,
              seasonId: ids.season,
              scoringPeriod: 1,
              kind: "waiver",
              outcome: "failed",
              actingFranchiseId: ids.home,
              proposedAt: "2025-09-01T00:00:00Z",
              processedAt: "2025-09-02T00:00:00Z",
              acceptedAt: null,
              bidAmount: 5,
              failureReason: "roster_limit",
            },
          ],
          transactionItems: [
            {
              transactionId: ids.transaction,
              ordinal: 0,
              playerId: ids.player,
              action: "add",
              fromFranchiseId: null,
              toFranchiseId: ids.home,
            },
          ],
          sourceMappings: [
            {
              provider: "espn",
              entityType: "draft_pick",
              canonicalId: ids.draftPick,
              externalId: "pick-1",
            },
            {
              provider: "espn",
              entityType: "transaction",
              canonicalId: ids.transaction,
              externalId: "transaction-1",
            },
          ],
        },
      });
      await provider.startImportRun({
        id: ids.playerStatsRun,
        provider: "espn",
        operation: "import",
        dataset: "player_stats",
        seasonYear: 2025,
        startedAt: "2026-08-23T23:06:00Z",
      });
      await provider.commitPlayerStatsImport({
        importRunId: ids.playerStatsRun,
        completedAt: "2026-08-23T23:07:00Z",
        snapshot: {
          seasonYear: 2025,
          nflTeams: [
            {
              id: ids.nflTeam,
              abbreviation: "SYN",
              displayName: "Synthetic Team",
            },
            {
              id: ids.awayNflTeam,
              abbreviation: "AWY",
              displayName: "Away NFL Team",
            },
          ],
          games: [
            {
              id: ids.game,
              seasonYear: 2025,
              gameType: 2,
              week: 1,
              startsAt: "2025-09-07T17:00:00Z",
              homeNflTeamId: ids.nflTeam,
              awayNflTeamId: ids.awayNflTeam,
              completed: true,
            },
          ],
          playerStats: [
            {
              playerId: ids.player,
              nflGameId: ids.game,
              nflTeamId: ids.nflTeam,
              passingAttempts: 30,
              passingCompletions: 20,
              passingYards: 250,
              passingTouchdowns: 2,
              passingInterceptions: 1,
              rushingAttempts: 3,
              rushingYards: 12,
              rushingTouchdowns: 0,
              receptions: 0,
              receivingTargets: 0,
              receivingYards: 0,
              receivingTouchdowns: 0,
              fumbles: 1,
              fumblesLost: 0,
              passingTwoPointConversions: 1,
              rushingTwoPointConversions: 0,
              receivingTwoPointConversions: 0,
              extraPointsMade: 0,
              extraPointsMissed: 0,
              madeFieldGoalDistances: [42],
              missedFieldGoalDistances: [51],
            },
          ],
          sourceMappings: [
            {
              provider: "espn",
              entityType: "nfl_game",
              canonicalId: ids.game,
              externalId: "game-1",
            },
          ],
        },
      });

      await expect(provider.listRelevantPlayers(2025)).resolves.toEqual([
        { id: ids.player, externalId: "101" },
      ]);
      await expect(
        provider.getMatchupRosterDetail(2025, ids.matchup),
      ).resolves.toMatchObject({
        matchupId: ids.matchup,
        periods: [
          {
            scoringPeriod: 1,
            teams: [
              {
                franchiseId: ids.home,
                players: [
                  expect.objectContaining({
                    playerId: ids.player,
                    projectedFantasyPoints: 18.25,
                  }),
                ],
              },
              {
                franchiseId: ids.away,
                players: [
                  expect.objectContaining({
                    playerId: ids.defense,
                    projectedFantasyPoints: null,
                  }),
                ],
              },
            ],
          },
        ],
      });
      await expect(
        provider.listSeasonDatasetStatuses(2025),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dataset: "rosters",
            status: "succeeded",
          }),
          expect.objectContaining({
            dataset: "transactions",
            status: "succeeded",
          }),
          expect.objectContaining({
            dataset: "player_stats",
            status: "succeeded",
          }),
        ]),
      );
      await expect(
        provider.executeReadOnlyQuery({
          statement: `
            SELECT
              passing_yards,
              made_field_goal_distances,
              missed_field_goal_distances
            FROM player_game_stats
            WHERE player_id = ?
          `,
          parameters: [ids.player],
        }),
      ).resolves.toEqual({
        columns: [
          "passing_yards",
          "made_field_goal_distances",
          "missed_field_goal_distances",
        ],
        rows: [
          {
            passing_yards: 250,
            made_field_goal_distances: "[42]",
            missed_field_goal_distances: "[51]",
          },
        ],
      });
      await expect(
        provider.executeReadOnlyQuery({
          statement: `
            SELECT outcome, failure_reason, bid_amount
            FROM fantasy_transactions
            WHERE id = ?
          `,
          parameters: [ids.transaction],
        }),
      ).resolves.toEqual({
        columns: ["outcome", "failure_reason", "bid_amount"],
        rows: [
          {
            outcome: "failed",
            failure_reason: "roster_limit",
            bid_amount: 5,
          },
        ],
      });
  });

  it("loads legacy seasons before authoritative configuration refresh", async () => {
    await provider.runMigrations();
    const legacySnapshot = createSnapshot();
    legacySnapshot.season.playoffTeamCount = null;
    legacySnapshot.seasonFranchiseNames = [];

    await importSnapshot(legacySnapshot);

    await expect(
      provider.getSeasonImportSnapshot(2025),
    ).resolves.toMatchObject({
      season: { playoffTeamCount: null },
      seasonFranchiseNames: [],
    });
    await expect(provider.listWeeklyTeamResults(2025)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamName: null }),
      ]),
    );
  });

  it("refreshes imported scores without deleting manual overrides", async () => {
    await provider.runMigrations();
    await importSnapshot();
    const matchupOverride = {
      id: ids.override,
      matchupId: ids.matchup,
      franchiseId: ids.home,
      scoreAdjustment: -1.25,
      reason: "Synthetic correction",
      createdAt: "2026-08-23T23:02:00Z",
    };
    await provider.saveMatchupOverride(matchupOverride);

    const refreshedSnapshot = createSnapshot();
    refreshedSnapshot.scores[0].score = 102.5;
    await importSnapshot(refreshedSnapshot, ids.refreshRun, "refresh");

    const storedSnapshot = await provider.getSeasonImportSnapshot(2025);
    expect(storedSnapshot?.scores).toContainEqual({
      matchupId: ids.matchup,
      franchiseId: ids.home,
      score: 102.5,
    });
    await expect(
      provider.listMatchupOverrides(ids.season),
    ).resolves.toEqual([matchupOverride]);
  });

  it("returns typed weekly scoring results", async () => {
    await provider.runMigrations();
    await importSnapshot();
    await provider.saveFranchiseDisplayName({
      franchiseId: ids.home,
      displayName: "Person One",
    });

    await expect(provider.listWeeklyTeamResults(2025)).resolves.toEqual([
      expect.objectContaining({
        matchupId: ids.matchup,
        matchupSide: "home",
        franchiseId: ids.home,
        displayName: "Person One",
        opponentFranchiseId: ids.away,
        effectiveScore: 101.25,
        nascarPoints: 2,
        headToHeadBonus: 2,
        adjustedNascarPoints: 4,
      }),
      expect.objectContaining({
        matchupId: ids.matchup,
        matchupSide: "away",
        franchiseId: ids.away,
        opponentFranchiseId: ids.home,
        effectiveScore: 99.75,
        nascarPoints: 1,
        headToHeadBonus: 0,
        adjustedNascarPoints: 1,
      }),
    ]);
  });

  it("persists application-owned franchise display names", async () => {
    await provider.runMigrations();
    await importSnapshot();

    await expect(
      provider.saveFranchiseDisplayName({
        franchiseId: ids.home,
        displayName: "Person One",
      }),
    ).resolves.toEqual({
      franchiseId: ids.home,
      displayName: "Person One",
    });
    await expect(provider.listFranchiseDisplayNames()).resolves.toEqual([
      {
        franchiseId: ids.home,
        displayName: "Person One",
      },
    ]);
  });

  it("records failed import runs explicitly", async () => {
    await provider.runMigrations();
    await provider.startImportRun({
      id: ids.failedRun,
      provider: "espn",
      operation: "refresh",
      seasonYear: 2025,
      startedAt: "2026-08-23T23:00:00Z",
    });

    await expect(
      provider.failImportRun({
        importRunId: ids.failedRun,
        completedAt: "2026-08-23T23:01:00Z",
        errorMessage: "Synthetic upstream failure",
      }),
    ).resolves.toMatchObject({
      status: "failed",
      errorMessage: "Synthetic upstream failure",
    });
    await expect(provider.listImportRuns()).resolves.toEqual([
      expect.objectContaining({
        id: ids.failedRun,
        status: "failed",
      }),
    ]);
  });

  it("rolls back a season import when persistence fails", async () => {
    await provider.runMigrations();
    await importSnapshot();

    const conflictingSnapshot = createSnapshot();
    conflictingSnapshot.league = {
      id: ids.otherLeague,
      name: "Other League",
    };
    conflictingSnapshot.season = {
      ...conflictingSnapshot.season,
      id: ids.otherSeason,
      leagueId: ids.otherLeague,
    };
    conflictingSnapshot.franchises = conflictingSnapshot.franchises.map(
      (franchise) => ({
        ...franchise,
        leagueId: ids.otherLeague,
      }),
    );
    conflictingSnapshot.matchups = conflictingSnapshot.matchups.map(
      (matchup) => ({ ...matchup, seasonId: ids.otherSeason }),
    );
    conflictingSnapshot.sourceMappings = [
      {
        provider: "espn",
        entityType: "league",
        canonicalId: ids.otherLeague,
        externalId: "other-league",
      },
    ];

    await provider.startImportRun({
      id: ids.refreshRun,
      provider: "espn",
      operation: "import",
      seasonYear: 2025,
      startedAt: "2026-08-23T23:03:00Z",
    });

    await expect(
      provider.commitSeasonImport({
        importRunId: ids.refreshRun,
        snapshot: conflictingSnapshot,
        completedAt: "2026-08-23T23:04:00Z",
      }),
    ).rejects.toThrow();

    await expect(
      provider.executeReadOnlyQuery({
        statement: "SELECT COUNT(*) AS count FROM leagues",
      }),
    ).resolves.toEqual({
      columns: ["count"],
      rows: [{ count: 1 }],
    });
  });

  it("rejects overrides for franchises outside the matchup", async () => {
    await provider.runMigrations();
    await importSnapshot();

    await expect(
      provider.saveMatchupOverride({
        id: ids.override,
        matchupId: ids.matchup,
        franchiseId: ids.otherLeague,
        scoreAdjustment: 1,
        reason: "Invalid synthetic correction",
        createdAt: "2026-08-23T23:02:00Z",
      }),
    ).rejects.toThrow(
      "A matchup override must target a participating franchise",
    );
  });

  it("rejects refreshes that would invalidate an existing override", async () => {
    await provider.runMigrations();
    await importSnapshot();
    await provider.saveMatchupOverride({
      id: ids.override,
      matchupId: ids.matchup,
      franchiseId: ids.home,
      scoreAdjustment: 1,
      reason: "Synthetic correction",
      createdAt: "2026-08-23T23:02:00Z",
    });

    const refreshedSnapshot = createSnapshot();
    refreshedSnapshot.matchups[0] = {
      ...refreshedSnapshot.matchups[0],
      homeFranchiseId: ids.away,
      awayFranchiseId: ids.otherLeague,
    };
    refreshedSnapshot.franchises[0] = {
      id: ids.otherLeague,
      leagueId: ids.league,
      ownerName: null,
    };
    refreshedSnapshot.franchiseNames = [
      {
        franchiseId: ids.otherLeague,
        name: "Replacement Team",
      },
      {
        franchiseId: ids.away,
        name: "Away Team",
      },
    ];
    refreshedSnapshot.seasonFranchiseNames[0] = {
      franchiseId: ids.otherLeague,
      name: "Replacement Team",
    };
    refreshedSnapshot.scores = [
      {
        matchupId: ids.matchup,
        franchiseId: ids.away,
        score: 99.75,
      },
      {
        matchupId: ids.matchup,
        franchiseId: ids.otherLeague,
        score: 101.25,
      },
    ];
    refreshedSnapshot.sourceMappings = refreshedSnapshot.sourceMappings.filter(
      (mapping) => mapping.canonicalId !== ids.home,
    );
    refreshedSnapshot.sourceMappings.push({
      provider: "espn",
      entityType: "franchise",
      canonicalId: ids.otherLeague,
      externalId: "team-3",
    });

    await provider.startImportRun({
      id: ids.refreshRun,
      provider: "espn",
      operation: "refresh",
      seasonYear: 2025,
      startedAt: "2026-08-23T23:03:00Z",
    });

    await expect(
      provider.commitSeasonImport({
        importRunId: ids.refreshRun,
        snapshot: refreshedSnapshot,
        completedAt: "2026-08-23T23:04:00Z",
      }),
    ).rejects.toThrow(
      "A season refresh cannot invalidate an existing matchup override",
    );
  });

  it("executes reads but rejects mutations in the advanced query path", async () => {
    await provider.runMigrations();

    await expect(
      provider.executeReadOnlyQuery({
        statement: "SELECT ? AS value",
        parameters: [14.5],
      }),
    ).resolves.toEqual({
      columns: ["value"],
      rows: [{ value: 14.5 }],
    });
    await expect(
      provider.executeReadOnlyQuery({
        statement: `
          WITH points AS (SELECT 14.5 AS value)
          SELECT value FROM points;
        `,
      }),
    ).resolves.toEqual({
      columns: ["value"],
      rows: [{ value: 14.5 }],
    });

    await expect(
      provider.executeReadOnlyQuery({
        statement: "INSERT INTO leagues (id, name) VALUES (?, ?)",
        parameters: [ids.league, "Forbidden"],
      }),
    ).rejects.toThrow();
    await expect(
      provider.executeReadOnlyQuery({
        statement: "SELECT 1; DELETE FROM leagues",
      }),
    ).rejects.toThrow("must contain exactly one statement");
    await expect(
      provider.executeReadOnlyQuery({
        statement: "SELECT COUNT(*) AS count FROM leagues",
      }),
    ).resolves.toEqual({
      columns: ["count"],
      rows: [{ count: 0 }],
    });
    await expect(
      provider.executeReadOnlyQuery({
        statement: "SELECT missing_column FROM leagues",
      }),
    ).rejects.toThrow("no such column: missing_column");
  });

  it("rejects blank read-only statements", async () => {
    await provider.runMigrations();

    await expect(
      provider.executeReadOnlyQuery({ statement: " " }),
    ).rejects.toThrow(LibSqlDatabaseError);
  });
});
