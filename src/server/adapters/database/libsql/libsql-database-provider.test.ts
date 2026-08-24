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
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 14,
    },
    franchises: [
      { id: ids.home, leagueId: ids.league, ownerName: "Owner One" },
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
    expect(storedSnapshot).toMatchObject({
      ...createSnapshot(),
      sourceMappings: expect.arrayContaining(
        createSnapshot().sourceMappings,
      ),
    });
    expect(storedSnapshot?.sourceMappings).toHaveLength(5);
    await expect(provider.listSourceMappings("espn")).resolves.toHaveLength(5);
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

  it("returns typed season standings and weekly scoring results", async () => {
    await provider.runMigrations();
    await importSnapshot();

    await expect(provider.listSeasonStandings(2025)).resolves.toEqual([
      expect.objectContaining({
        franchiseId: ids.home,
        teamName: "Home Team",
        weeksPlayed: 1,
        totalNascarPoints: 2,
        totalHeadToHeadBonus: 2,
        totalAdjustedNascarPoints: 4,
        qualificationRank: 1,
      }),
      expect.objectContaining({
        franchiseId: ids.away,
        teamName: "Away Team",
        totalAdjustedNascarPoints: 1,
        qualificationRank: 2,
      }),
    ]);
    await expect(provider.listWeeklyTeamResults(2025)).resolves.toEqual([
      expect.objectContaining({
        matchupId: ids.matchup,
        matchupSide: "home",
        franchiseId: ids.home,
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
    refreshedSnapshot.franchiseNames[0] = {
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
  });

  it("rejects blank read-only statements", async () => {
    await provider.runMigrations();

    await expect(
      provider.executeReadOnlyQuery({ statement: " " }),
    ).rejects.toThrow(LibSqlDatabaseError);
  });
});
