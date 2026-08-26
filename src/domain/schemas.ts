import { z } from "zod";

import type {
  Franchise,
  FranchiseDisplayName,
  FranchiseName,
  ImportedMatchupScore,
  ImportRun,
  League,
  Matchup,
  MatchupOverride,
  Season,
  SeasonImportSnapshot,
  SourceMapping,
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
    playoffTeamCount: z.int().positive(),
    regularSeasonStartWeek: weekSchema,
    regularSeasonEndWeek: weekSchema,
  })
  .refine(
    (season) => season.playoffTeamCount <= season.teamCount,
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
  entityType: z.enum(["league", "season", "franchise", "matchup"]),
  canonicalId: canonicalIdSchema,
  externalId: nonEmptyTextSchema,
});

export const importRunSchema: z.ZodType<ImportRun> = z
  .object({
    id: canonicalIdSchema,
    provider: nonEmptyTextSchema,
    operation: z.enum(["import", "refresh"]),
    seasonYear: seasonYearSchema,
    status: z.enum(["running", "succeeded", "failed"]),
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

    if (run.status !== "failed" && run.errorMessage !== null) {
      context.addIssue({
        code: "custom",
        message: "must be null unless an import fails",
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

export const seasonImportSnapshotSchema: z.ZodType<SeasonImportSnapshot> =
  z
    .object({
      league: leagueSchema,
      season: seasonSchema,
      franchises: z.array(franchiseSchema),
      franchiseNames: z.array(franchiseNameSchema),
      seasonFranchiseNames: z.array(franchiseNameSchema),
      matchups: z.array(matchupSchema),
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

        if (seasonNames.length !== 1) {
          addReferenceIssue(
            context,
            ["seasonFranchiseNames"],
            `must contain exactly one name for franchise ${franchiseId}`,
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
        if (
          !canonicalIdsByType[mapping.entityType].has(mapping.canonicalId)
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
    });
