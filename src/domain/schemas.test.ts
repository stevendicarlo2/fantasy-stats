import { describe, expect, it } from "vitest";

import {
  importRunSchema,
  matchupOverrideSchema,
  seasonImportSnapshotSchema,
} from "./schemas";
import type { SeasonImportSnapshot } from "./types";

const ids = {
  league: "11111111-1111-4111-8111-111111111111",
  season: "22222222-2222-4222-8222-222222222222",
  home: "33333333-3333-4333-8333-333333333333",
  away: "44444444-4444-4444-8444-444444444444",
  matchup: "55555555-5555-4555-8555-555555555555",
  override: "66666666-6666-4666-8666-666666666666",
  importRun: "77777777-7777-4777-8777-777777777777",
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
        entityType: "franchise",
        canonicalId: ids.home,
        externalId: "team-1",
      },
    ],
  };
}

describe("seasonImportSnapshotSchema", () => {
  it("accepts a consistent canonical season snapshot", () => {
    expect(seasonImportSnapshotSchema.parse(createSnapshot())).toEqual(
      createSnapshot(),
    );
  });

  it("rejects scores with more than two decimal places", () => {
    const snapshot = createSnapshot();
    snapshot.scores[0].score = 101.251;

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "multiple of 0.01",
    );
  });

  it("rejects a matchup missing one franchise score", () => {
    const snapshot = createSnapshot();
    snapshot.scores.pop();

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must have exactly one imported score for each franchise",
    );
  });

  it("rejects references to franchises outside the snapshot", () => {
    const snapshot = createSnapshot();
    snapshot.matchups[0].awayFranchiseId = ids.override;

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must reference a snapshot franchise",
    );
  });

  it("rejects snapshots that do not match the declared team count", () => {
    const snapshot = createSnapshot();
    snapshot.season.teamCount = 4;

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must contain the season's declared number of teams",
    );
  });

  it("requires every franchise to have a known name", () => {
    const snapshot = createSnapshot();
    snapshot.franchiseNames.pop();

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must contain at least one name for franchise",
    );
  });

  it("rejects duplicate provider entity mappings", () => {
    const snapshot = createSnapshot();
    snapshot.sourceMappings.push({ ...snapshot.sourceMappings[0] });

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "duplicates a provider entity mapping",
    );
  });

  it("rejects regular matchups outside regular-season boundaries", () => {
    const snapshot = createSnapshot();
    snapshot.matchups[0].week = 15;

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must fall within the season's regular-season boundaries",
    );
  });

  it("rejects duplicate franchise appearances within a week", () => {
    const snapshot = createSnapshot();
    const duplicateMatchupId =
      "88888888-8888-4888-8888-888888888888";
    snapshot.matchups.push({
      ...snapshot.matchups[0],
      id: duplicateMatchupId,
    });
    snapshot.scores.push(
      {
        matchupId: duplicateMatchupId,
        franchiseId: ids.home,
        score: 101.25,
      },
      {
        matchupId: duplicateMatchupId,
        franchiseId: ids.away,
        score: 99.75,
      },
    );

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "must contain exactly one matchup for franchise",
    );
  });

  it("accepts postseason bye records with one score", () => {
    const snapshot = createSnapshot();
    const secondMatchupId =
      "99999999-9999-4999-8999-999999999999";
    snapshot.matchups[0] = {
      ...snapshot.matchups[0],
      week: 15,
      phase: "playoff",
      awayFranchiseId: null,
    };
    snapshot.matchups.push({
      id: secondMatchupId,
      seasonId: ids.season,
      week: 15,
      phase: "consolation",
      homeFranchiseId: ids.away,
      awayFranchiseId: null,
    });
    snapshot.scores = [
      snapshot.scores[0],
      {
        matchupId: secondMatchupId,
        franchiseId: ids.away,
        score: 99.75,
      },
    ];

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it("rejects regular-season bye records", () => {
    const snapshot = createSnapshot();
    snapshot.matchups[0].awayFranchiseId = null;
    snapshot.scores.pop();
    snapshot.franchises.pop();
    snapshot.franchiseNames.pop();

    expect(() => seasonImportSnapshotSchema.parse(snapshot)).toThrow(
      "regular-season matchups must have an opponent",
    );
  });
});

describe("matchupOverrideSchema", () => {
  it("accepts negative two-decimal score adjustments", () => {
    expect(
      matchupOverrideSchema.parse({
        id: ids.override,
        matchupId: ids.matchup,
        franchiseId: ids.home,
        scoreAdjustment: -1.25,
        reason: "Correct a synthetic scoring discrepancy",
        createdAt: "2026-08-23T23:00:00Z",
      }),
    ).toMatchObject({ scoreAdjustment: -1.25 });
  });

  it("requires a human-readable reason", () => {
    expect(() =>
      matchupOverrideSchema.parse({
        id: ids.override,
        matchupId: ids.matchup,
        franchiseId: ids.home,
        scoreAdjustment: 1,
        reason: " ",
        createdAt: "2026-08-23T23:00:00Z",
      }),
    ).toThrow();
  });
});

describe("importRunSchema", () => {
  it("requires failures to have completion and error details", () => {
    expect(() =>
      importRunSchema.parse({
        id: ids.importRun,
        provider: "espn",
        operation: "refresh",
        seasonYear: 2025,
        status: "failed",
        startedAt: "2026-08-23T22:00:00Z",
        completedAt: null,
        errorMessage: null,
      }),
    ).toThrow("is required when an import fails");
  });
});
