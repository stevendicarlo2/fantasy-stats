import { z } from "zod";

import type {
  DraftPick,
  FantasyTransaction,
  FantasyTransactionItem,
  Franchise,
  FranchiseDisplayName,
  FranchiseName,
  ImportedMatchupScore,
  ImportRun,
  League,
  Matchup,
  MatchupScoringPeriod,
  MatchupOverride,
  NflGame,
  NflTeam,
  Player,
  PlayerGameStats,
  PlayerNflTeamRange,
  PlayerPositionRange,
  PlayerStatsImportSnapshot,
  RosterImportSnapshot,
  Season,
  SeasonImportSnapshot,
  SourceMapping,
  TransactionImportSnapshot,
  WeeklyRosterEntry,
  WeeklyRosterSnapshot,
} from "./types";

const canonicalIdSchema = z.uuid();
const nonEmptyTextSchema = z.string().trim().min(1);
const weekSchema = z.int().positive();
const seasonYearSchema = z.int().min(1900).max(2100);
const scoreSchema = z.number().multipleOf(0.01);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const leagueSchema: z.ZodType<League> = z.object({
  id: canonicalIdSchema,
  name: nonEmptyTextSchema,
});

export const seasonSchema: z.ZodType<Season> = z
  .object({
    id: canonicalIdSchema,
    leagueId: canonicalIdSchema,
    year: seasonYearSchema,
    teamCount: z.int().min(2),
    playoffTeamCount: z.int().positive().nullable(),
    regularSeasonStartWeek: weekSchema,
    regularSeasonEndWeek: weekSchema,
  })
  .refine(
    (season) =>
      season.playoffTeamCount === null ||
      season.playoffTeamCount <= season.teamCount,
    {
      message: "must not exceed the season's team count",
      path: ["playoffTeamCount"],
    },
  )
  .refine(
    (season) =>
      season.regularSeasonEndWeek >= season.regularSeasonStartWeek,
    {
      message: "must not precede the regular-season start week",
      path: ["regularSeasonEndWeek"],
    },
  );

export const franchiseSchema: z.ZodType<Franchise> = z.object({
  id: canonicalIdSchema,
  leagueId: canonicalIdSchema,
  ownerName: nonEmptyTextSchema.nullable(),
});

export const franchiseNameSchema: z.ZodType<FranchiseName> = z.object({
  franchiseId: canonicalIdSchema,
  name: nonEmptyTextSchema,
});

export const franchiseDisplayNameSchema: z.ZodType<FranchiseDisplayName> =
  z.object({
    franchiseId: canonicalIdSchema,
    displayName: nonEmptyTextSchema,
  });

export const matchupSchema: z.ZodType<Matchup> = z
  .object({
    id: canonicalIdSchema,
    seasonId: canonicalIdSchema,
    week: weekSchema,
    phase: z.enum(["regular", "playoff", "consolation"]),
    homeFranchiseId: canonicalIdSchema,
    awayFranchiseId: canonicalIdSchema.nullable(),
  })
  .refine(
    (matchup) =>
      matchup.awayFranchiseId === null ||
      matchup.homeFranchiseId !== matchup.awayFranchiseId,
    {
      message: "must contain two different franchises",
      path: ["awayFranchiseId"],
    },
  )
  .refine(
    (matchup) =>
      matchup.phase !== "regular" || matchup.awayFranchiseId !== null,
    {
      message: "regular-season matchups must have an opponent",
      path: ["awayFranchiseId"],
    },
  );

export const importedMatchupScoreSchema: z.ZodType<ImportedMatchupScore> =
  z.object({
    matchupId: canonicalIdSchema,
    franchiseId: canonicalIdSchema,
    score: scoreSchema,
  });

export const matchupOverrideSchema: z.ZodType<MatchupOverride> = z.object({
  id: canonicalIdSchema,
  matchupId: canonicalIdSchema,
  franchiseId: canonicalIdSchema,
  scoreAdjustment: scoreSchema,
  reason: nonEmptyTextSchema,
  createdAt: isoDateTimeSchema,
});

export const sourceMappingSchema: z.ZodType<SourceMapping> = z.object({
  provider: nonEmptyTextSchema,
  entityType: z.enum([
    "league",
    "season",
    "franchise",
    "matchup",
    "player",
    "nfl_team",
    "nfl_game",
    "transaction",
    "draft_pick",
  ]),
  canonicalId: canonicalIdSchema,
  externalId: nonEmptyTextSchema,
});

export const importRunSchema: z.ZodType<ImportRun> = z
  .object({
    id: canonicalIdSchema,
    provider: nonEmptyTextSchema,
    operation: z.enum(["import", "refresh"]),
    dataset: z
      .enum(["core", "rosters", "transactions", "player_stats"])
      .default("core"),
    seasonYear: seasonYearSchema,
    status: z.enum(["running", "succeeded", "failed", "unavailable"]),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
    errorMessage: nonEmptyTextSchema.nullable(),
  })
  .superRefine((run, context) => {
    if (run.status === "running" && run.completedAt !== null) {
      context.addIssue({
        code: "custom",
        message: "must be null while an import is running",
        path: ["completedAt"],
      });
    }

    if (run.status !== "running" && run.completedAt === null) {
      context.addIssue({
        code: "custom",
        message: "is required when an import has finished",
        path: ["completedAt"],
      });
    }

    if (run.status === "failed" && run.errorMessage === null) {
      context.addIssue({
        code: "custom",
        message: "is required when an import fails",
        path: ["errorMessage"],
      });
    }

    if (
      run.status !== "failed" &&
      run.status !== "unavailable" &&
      run.errorMessage !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "must be null unless an import fails or is unavailable",
        path: ["errorMessage"],
      });
    }

    if (run.status === "unavailable" && run.errorMessage === null) {
      context.addIssue({
        code: "custom",
        message: "is required when a dataset is unavailable",
        path: ["errorMessage"],
      });
    }
  });

function addReferenceIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
) {
  context.addIssue({ code: "custom", path, message });
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return duplicates;
}

export const matchupScoringPeriodSchema: z.ZodType<MatchupScoringPeriod> =
  z.object({
    matchupId: canonicalIdSchema,
    scoringPeriod: weekSchema,
  });

export const seasonImportSnapshotSchema: z.ZodType<SeasonImportSnapshot> =
  z
    .object({
      league: leagueSchema,
      season: seasonSchema,
      franchises: z.array(franchiseSchema),
      franchiseNames: z.array(franchiseNameSchema),
      seasonFranchiseNames: z.array(franchiseNameSchema),
      matchups: z.array(matchupSchema),
      matchupScoringPeriods: z
        .array(matchupScoringPeriodSchema)
        .optional(),
      scores: z.array(importedMatchupScoreSchema),
      sourceMappings: z.array(sourceMappingSchema),
    })
    .superRefine((snapshot, context) => {
      if (snapshot.season.leagueId !== snapshot.league.id) {
        addReferenceIssue(
          context,
          ["season", "leagueId"],
          "must reference the snapshot league",
        );
      }

      const franchiseIds = new Set(
        snapshot.franchises.map((franchise) => franchise.id),
      );
      const matchupIds = new Set(
        snapshot.matchups.map((matchup) => matchup.id),
      );

      if (snapshot.franchises.length !== snapshot.season.teamCount) {
        addReferenceIssue(
          context,
          ["franchises"],
          "must contain the season's declared number of teams",
        );
      }

      for (const duplicateId of findDuplicates([
        snapshot.league.id,
        snapshot.season.id,
        ...snapshot.franchises.map((franchise) => franchise.id),
        ...snapshot.matchups.map((matchup) => matchup.id),
      ])) {
        addReferenceIssue(
          context,
          ["franchises"],
          `canonical ID ${duplicateId} is used more than once`,
        );
      }

      snapshot.franchises.forEach((franchise, index) => {
        if (franchise.leagueId !== snapshot.league.id) {
          addReferenceIssue(
            context,
            ["franchises", index, "leagueId"],
            "must reference the snapshot league",
          );
        }
      });

      snapshot.franchiseNames.forEach((name, index) => {
        if (!franchiseIds.has(name.franchiseId)) {
          addReferenceIssue(
            context,
            ["franchiseNames", index, "franchiseId"],
            "must reference a snapshot franchise",
          );
        }
      });

      snapshot.seasonFranchiseNames.forEach((name, index) => {
        if (!franchiseIds.has(name.franchiseId)) {
          addReferenceIssue(
            context,
            ["seasonFranchiseNames", index, "franchiseId"],
            "must reference a snapshot franchise",
          );
        }
      });

      for (const franchiseId of franchiseIds) {
        if (
          !snapshot.franchiseNames.some(
            (name) => name.franchiseId === franchiseId,
          )
        ) {
          addReferenceIssue(
            context,
            ["franchiseNames"],
            `must contain at least one name for franchise ${franchiseId}`,
          );
        }

        const seasonNames = snapshot.seasonFranchiseNames.filter(
          (name) => name.franchiseId === franchiseId,
        );

        if (seasonNames.length > 1) {
          addReferenceIssue(
            context,
            ["seasonFranchiseNames"],
            `must contain at most one name for franchise ${franchiseId}`,
          );
        }
      }

      const scoresByMatchup = new Map<string, Map<string, number>>();
      const appearancesByWeek = new Map<number, Map<string, number>>();

      snapshot.matchups.forEach((matchup, index) => {
        if (matchup.seasonId !== snapshot.season.id) {
          addReferenceIssue(
            context,
            ["matchups", index, "seasonId"],
            "must reference the snapshot season",
          );
        }

        for (const [field, franchiseId] of [
          ["homeFranchiseId", matchup.homeFranchiseId],
          ["awayFranchiseId", matchup.awayFranchiseId],
        ] as const) {
          if (franchiseId !== null && !franchiseIds.has(franchiseId)) {
            addReferenceIssue(
              context,
              ["matchups", index, field],
              "must reference a snapshot franchise",
            );
          }
        }

        const isRegularSeasonWeek =
          matchup.week >= snapshot.season.regularSeasonStartWeek &&
          matchup.week <= snapshot.season.regularSeasonEndWeek;

        if (matchup.phase === "regular" && !isRegularSeasonWeek) {
          addReferenceIssue(
            context,
            ["matchups", index, "week"],
            "must fall within the season's regular-season boundaries",
          );
        }

        const weekAppearances =
          appearancesByWeek.get(matchup.week) ?? new Map<string, number>();

        for (const franchiseId of [
          matchup.homeFranchiseId,
          matchup.awayFranchiseId,
        ]) {
          if (franchiseId === null) {
            continue;
          }

          weekAppearances.set(
            franchiseId,
            (weekAppearances.get(franchiseId) ?? 0) + 1,
          );
        }

        appearancesByWeek.set(matchup.week, weekAppearances);
      });

      for (const [week, appearances] of appearancesByWeek) {
        for (const franchiseId of franchiseIds) {
          if (appearances.get(franchiseId) !== 1) {
            addReferenceIssue(
              context,
              ["matchups"],
              `week ${week} must contain exactly one matchup for franchise ${franchiseId}`,
            );
          }
        }
      }

      snapshot.scores.forEach((score, index) => {
        const matchup = snapshot.matchups.find(
          (candidate) => candidate.id === score.matchupId,
        );

        if (!matchup) {
          addReferenceIssue(
            context,
            ["scores", index, "matchupId"],
            "must reference a snapshot matchup",
          );
          return;
        }

        if (
          score.franchiseId !== matchup.homeFranchiseId &&
          score.franchiseId !== matchup.awayFranchiseId
        ) {
          addReferenceIssue(
            context,
            ["scores", index, "franchiseId"],
            "must reference a franchise participating in the matchup",
          );
        }

        const matchupScores =
          scoresByMatchup.get(score.matchupId) ?? new Map<string, number>();

        matchupScores.set(
          score.franchiseId,
          (matchupScores.get(score.franchiseId) ?? 0) + 1,
        );
        scoresByMatchup.set(score.matchupId, matchupScores);
      });

      snapshot.matchups.forEach((matchup, index) => {
        const matchupScores = scoresByMatchup.get(matchup.id);

        for (const franchiseId of [
          matchup.homeFranchiseId,
          matchup.awayFranchiseId,
        ]) {
          if (franchiseId === null) {
            continue;
          }

          if (matchupScores?.get(franchiseId) !== 1) {
            addReferenceIssue(
              context,
              ["matchups", index],
              "must have exactly one imported score for each franchise",
            );
          }
        }
      });

      const canonicalIdsByType = {
        league: new Set([snapshot.league.id]),
        season: new Set([snapshot.season.id]),
        franchise: franchiseIds,
        matchup: matchupIds,
      };
      const sourceMappingKeys = new Set<string>();

      snapshot.sourceMappings.forEach((mapping, index) => {
        const snapshotIds = canonicalIdsByType[
          mapping.entityType as keyof typeof canonicalIdsByType
        ] as Set<string> | undefined;

        if (
          !snapshotIds ||
          !snapshotIds.has(mapping.canonicalId)
        ) {
          addReferenceIssue(
            context,
            ["sourceMappings", index, "canonicalId"],
            `must reference a snapshot ${mapping.entityType}`,
          );
        }

        const mappingKey = [
          mapping.provider,
          mapping.entityType,
          mapping.externalId,
        ].join("\u0000");

        if (sourceMappingKeys.has(mappingKey)) {
          addReferenceIssue(
            context,
            ["sourceMappings", index],
            "duplicates a provider entity mapping",
          );
        } else {
          sourceMappingKeys.add(mappingKey);
        }
      });

      snapshot.matchupScoringPeriods?.forEach((period, index) => {
        if (!matchupIds.has(period.matchupId)) {
          addReferenceIssue(
            context,
            ["matchupScoringPeriods", index, "matchupId"],
            "must reference a snapshot matchup",
          );
        }
      });
    });

export const playerSchema: z.ZodType<Player> = z.object({
  id: canonicalIdSchema,
  kind: z.enum(["athlete", "team_defense"]),
  displayName: nonEmptyTextSchema,
  firstName: nonEmptyTextSchema.nullable(),
  lastName: nonEmptyTextSchema.nullable(),
});

export const nflTeamSchema: z.ZodType<NflTeam> = z.object({
  id: canonicalIdSchema,
  abbreviation: nonEmptyTextSchema,
  displayName: nonEmptyTextSchema,
});

export const weeklyRosterSnapshotSchema: z.ZodType<WeeklyRosterSnapshot> =
  z.object({
    seasonId: canonicalIdSchema,
    scoringPeriod: weekSchema,
    franchiseId: canonicalIdSchema,
    state: z.enum(["provisional", "final"]),
  });

export const weeklyRosterEntrySchema: z.ZodType<WeeklyRosterEntry> =
  z.object({
    seasonId: canonicalIdSchema,
    scoringPeriod: weekSchema,
    franchiseId: canonicalIdSchema,
    playerId: canonicalIdSchema,
    lineupSlot: z.enum([
      "QB",
      "RB",
      "WR",
      "TE",
      "FLEX",
      "OP",
      "K",
      "DST",
      "BE",
      "IR",
    ]),
    rosterOrder: z.int().nonnegative(),
    actualFantasyPoints: z.number(),
    projectedFantasyPoints: z.number().nullable(),
  });

export const playerNflTeamRangeSchema: z.ZodType<PlayerNflTeamRange> = z
  .object({
    playerId: canonicalIdSchema,
    seasonId: canonicalIdSchema,
    nflTeamId: canonicalIdSchema,
    startScoringPeriod: weekSchema,
    endScoringPeriod: weekSchema,
  })
  .refine(
    (range) => range.endScoringPeriod >= range.startScoringPeriod,
    {
      message: "must not end before it starts",
      path: ["endScoringPeriod"],
    },
  );

export const playerPositionRangeSchema: z.ZodType<PlayerPositionRange> = z
  .object({
    playerId: canonicalIdSchema,
    seasonId: canonicalIdSchema,
    position: z.enum(["QB", "RB", "WR", "TE", "K", "DST"]),
    startScoringPeriod: weekSchema,
    endScoringPeriod: weekSchema,
  })
  .refine(
    (range) => range.endScoringPeriod >= range.startScoringPeriod,
    {
      message: "must not end before it starts",
      path: ["endScoringPeriod"],
    },
  );

export const rosterImportSnapshotSchema: z.ZodType<RosterImportSnapshot> =
  z
    .object({
      seasonId: canonicalIdSchema,
      seasonYear: seasonYearSchema,
      players: z.array(playerSchema),
      nflTeams: z.array(nflTeamSchema),
      rosters: z.array(weeklyRosterSnapshotSchema),
      entries: z.array(weeklyRosterEntrySchema),
      nflTeamRanges: z.array(playerNflTeamRangeSchema),
      positionRanges: z.array(playerPositionRangeSchema),
      sourceMappings: z.array(sourceMappingSchema),
    })
    .superRefine((snapshot, context) => {
      const playerIds = new Set(snapshot.players.map((player) => player.id));
      const nflTeamIds = new Set(snapshot.nflTeams.map((team) => team.id));
      const rosterKeys = new Set(
        snapshot.rosters.map(
          (roster) =>
            `${roster.seasonId}:${roster.scoringPeriod}:${roster.franchiseId}`,
        ),
      );

      snapshot.rosters.forEach((roster, index) => {
        if (roster.seasonId !== snapshot.seasonId) {
          addReferenceIssue(
            context,
            ["rosters", index, "seasonId"],
            "must reference the snapshot season",
          );
        }
      });
      snapshot.entries.forEach((entry, index) => {
        const rosterKey = `${entry.seasonId}:${entry.scoringPeriod}:${entry.franchiseId}`;

        if (!rosterKeys.has(rosterKey)) {
          addReferenceIssue(
            context,
            ["entries", index],
            "must reference a roster in the snapshot",
          );
        }

        if (!playerIds.has(entry.playerId)) {
          addReferenceIssue(
            context,
            ["entries", index, "playerId"],
            "must reference a player in the snapshot",
          );
        }
      });
      snapshot.nflTeamRanges.forEach((range, index) => {
        if (!playerIds.has(range.playerId)) {
          addReferenceIssue(
            context,
            ["nflTeamRanges", index, "playerId"],
            "must reference a player in the snapshot",
          );
        }

        if (!nflTeamIds.has(range.nflTeamId)) {
          addReferenceIssue(
            context,
            ["nflTeamRanges", index, "nflTeamId"],
            "must reference an NFL team in the snapshot",
          );
        }
      });
      snapshot.positionRanges.forEach((range, index) => {
        if (!playerIds.has(range.playerId)) {
          addReferenceIssue(
            context,
            ["positionRanges", index, "playerId"],
            "must reference a player in the snapshot",
          );
        }
      });
    });

export const draftPickSchema: z.ZodType<DraftPick> = z.object({
  id: canonicalIdSchema,
  seasonId: canonicalIdSchema,
  franchiseId: canonicalIdSchema,
  playerId: canonicalIdSchema,
  round: z.int().positive(),
  roundPick: z.int().positive(),
  overallPick: z.int().positive(),
  keeper: z.boolean(),
  auctionBid: z.number().nonnegative().nullable(),
});

export const fantasyTransactionSchema: z.ZodType<FantasyTransaction> =
  z
    .object({
      id: canonicalIdSchema,
      seasonId: canonicalIdSchema,
      scoringPeriod: weekSchema,
      kind: z.enum(["free_agent", "waiver", "trade", "administrative"]),
      outcome: z.enum(["executed", "failed"]),
      actingFranchiseId: canonicalIdSchema.nullable(),
      proposedAt: isoDateTimeSchema.nullable(),
      processedAt: isoDateTimeSchema.nullable(),
      acceptedAt: isoDateTimeSchema.nullable(),
      bidAmount: z.number().nonnegative().nullable(),
      failureReason: z
        .enum([
          "auction_budget_exceeded",
          "invalid_player_source",
          "invalid_ir_slot",
          "matchup_acquisition_limit",
          "player_already_dropped",
          "roster_limit",
          "roster_lock",
        ])
        .nullable(),
    })
    .superRefine((transaction, context) => {
      if (
        transaction.outcome === "executed" &&
        transaction.failureReason !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "must be null for an executed transaction",
          path: ["failureReason"],
        });
      }

      if (
        transaction.outcome === "failed" &&
        transaction.failureReason === null
      ) {
        context.addIssue({
          code: "custom",
          message: "is required for a failed transaction",
          path: ["failureReason"],
        });
      }
    });

export const fantasyTransactionItemSchema: z.ZodType<FantasyTransactionItem> =
  z.object({
    transactionId: canonicalIdSchema,
    ordinal: z.int().nonnegative(),
    playerId: canonicalIdSchema,
    action: z.enum(["add", "drop", "trade"]),
    fromFranchiseId: canonicalIdSchema.nullable(),
    toFranchiseId: canonicalIdSchema.nullable(),
  });

export const transactionImportSnapshotSchema: z.ZodType<TransactionImportSnapshot> =
  z
    .object({
      seasonId: canonicalIdSchema,
      seasonYear: seasonYearSchema,
      players: z.array(playerSchema),
      nflTeams: z.array(nflTeamSchema),
      draftPicks: z.array(draftPickSchema),
      transactions: z.array(fantasyTransactionSchema),
      transactionItems: z.array(fantasyTransactionItemSchema),
      sourceMappings: z.array(sourceMappingSchema),
    })
    .superRefine((snapshot, context) => {
      const playerIds = new Set(snapshot.players.map((player) => player.id));
      const transactionIds = new Set(
        snapshot.transactions.map((transaction) => transaction.id),
      );

      snapshot.draftPicks.forEach((pick, index) => {
        if (
          pick.seasonId !== snapshot.seasonId ||
          !playerIds.has(pick.playerId)
        ) {
          addReferenceIssue(
            context,
            ["draftPicks", index],
            "must reference the snapshot season and a snapshot player",
          );
        }
      });
      snapshot.transactions.forEach((transaction, index) => {
        if (transaction.seasonId !== snapshot.seasonId) {
          addReferenceIssue(
            context,
            ["transactions", index, "seasonId"],
            "must reference the snapshot season",
          );
        }
      });
      snapshot.transactionItems.forEach((item, index) => {
        if (
          !transactionIds.has(item.transactionId) ||
          !playerIds.has(item.playerId)
        ) {
          addReferenceIssue(
            context,
            ["transactionItems", index],
            "must reference a transaction and player in the snapshot",
          );
        }
      });
    });

export const nflGameSchema: z.ZodType<NflGame> = z.object({
  id: canonicalIdSchema,
  seasonYear: seasonYearSchema,
  seasonType: z.int().positive(),
  week: weekSchema,
  startsAt: isoDateTimeSchema,
  homeNflTeamId: canonicalIdSchema,
  awayNflTeamId: canonicalIdSchema,
  completed: z.boolean(),
});

export const playerGameStatsSchema: z.ZodType<PlayerGameStats> = z.object({
  playerId: canonicalIdSchema,
  nflGameId: canonicalIdSchema,
  nflTeamId: canonicalIdSchema,
  passingAttempts: z.int().nonnegative(),
  passingCompletions: z.int().nonnegative(),
  passingYards: z.int(),
  passingTouchdowns: z.int().nonnegative(),
  passingInterceptions: z.int().nonnegative(),
  rushingAttempts: z.int().nonnegative(),
  rushingYards: z.int(),
  rushingTouchdowns: z.int().nonnegative(),
  receptions: z.int().nonnegative(),
  receivingTargets: z.int().nonnegative(),
  receivingYards: z.int(),
  receivingTouchdowns: z.int().nonnegative(),
  fumbles: z.int().nonnegative(),
  fumblesLost: z.int().nonnegative(),
  passingTwoPointConversions: z.int().nonnegative(),
  rushingTwoPointConversions: z.int().nonnegative(),
  receivingTwoPointConversions: z.int().nonnegative(),
  extraPointsMade: z.int().nonnegative(),
  extraPointsMissed: z.int().nonnegative(),
  madeFieldGoalDistances: z.array(z.int().nonnegative()),
  missedFieldGoalDistances: z.array(z.int().nonnegative()),
});

export const playerStatsImportSnapshotSchema: z.ZodType<PlayerStatsImportSnapshot> =
  z
    .object({
      seasonYear: seasonYearSchema,
      nflTeams: z.array(nflTeamSchema),
      games: z.array(nflGameSchema),
      playerStats: z.array(playerGameStatsSchema),
      sourceMappings: z.array(sourceMappingSchema),
    })
    .superRefine((snapshot, context) => {
      const nflTeamIds = new Set(snapshot.nflTeams.map((team) => team.id));
      const gameIds = new Set(snapshot.games.map((game) => game.id));

      snapshot.games.forEach((game, index) => {
        if (
          game.seasonYear !== snapshot.seasonYear ||
          !nflTeamIds.has(game.homeNflTeamId) ||
          !nflTeamIds.has(game.awayNflTeamId)
        ) {
          addReferenceIssue(
            context,
            ["games", index],
            "must reference the snapshot season and NFL teams",
          );
        }
      });
      snapshot.playerStats.forEach((stats, index) => {
        if (
          !gameIds.has(stats.nflGameId) ||
          !nflTeamIds.has(stats.nflTeamId)
        ) {
          addReferenceIssue(
            context,
            ["playerStats", index],
            "must reference a game and NFL team in the snapshot",
          );
        }
      });
    });
