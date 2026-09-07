import { randomUUID } from "node:crypto";

import { z } from "zod";

import { SafeOperationalError } from "@/application/errors";
import type {
  FetchPlayerStatsInput,
  NflSource,
} from "@/application/ports/nfl-source";
import { playerStatsImportSnapshotSchema } from "@/domain/schemas";
import type {
  CanonicalId,
  NflTeam,
  PlayerGameStats,
  PlayerStatsImportSnapshot,
  SourceEntityType,
  SourceMapping,
} from "@/domain/types";

const teamSchema = z.object({
  id: z.string(),
  abbreviation: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
});

const scoreboardSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      date: z.iso.datetime({ offset: true }),
      season: z.object({
        type: z.int().positive(),
      }),
      week: z.object({
        number: z.int().positive(),
      }),
      competitions: z
        .array(
          z.object({
            competitors: z.array(
              z.object({
                homeAway: z.enum(["home", "away"]),
                team: teamSchema,
              }),
            ),
            status: z.object({
              type: z.object({
                completed: z.boolean(),
              }),
            }),
          }),
        )
        .min(1),
    }),
  ),
});

const boxscoreSchema = z.object({
  boxscore: z.object({
    players: z
      .array(
        z.object({
          team: z.object({ id: z.string() }),
          statistics: z.array(
            z.object({
              name: z.string(),
              labels: z.array(z.string()),
              athletes: z.array(
                z.object({
                  athlete: z.object({ id: z.string() }),
                  stats: z.array(z.string()),
                }),
              ),
            }),
          ),
        }),
      )
      .default([]),
  }),
});

const referenceSchema = z.object({
  $ref: z.string().url(),
});

const playSchema = z.object({
  type: z.object({ text: z.string() }).optional(),
  text: z.string().optional(),
  statYardage: z.number().optional(),
  team: referenceSchema.optional(),
  participants: z
    .array(
      z.object({
        athlete: referenceSchema,
        type: z.string(),
      }),
    )
    .default([]),
  pointAfterAttempt: z
    .object({
      text: z.string(),
      value: z.number(),
    })
    .optional(),
});

const playsSchema = z.object({
  items: z.array(playSchema).default([]),
});

interface EspnNflSourceOptions {
  fetchImplementation?: typeof fetch;
  createId?: () => CanonicalId;
  concurrency?: number;
}

interface MutableStats extends PlayerGameStats {
  externalPlayerId: string;
}

export class EspnNflHttpError extends SafeOperationalError {
  constructor(status: number, resource: string) {
    super(`ESPN NFL ${resource} request failed with HTTP status ${status}`);
    this.name = "EspnNflHttpError";
  }
}

export class EspnNflPayloadError extends SafeOperationalError {
  constructor(resource: string) {
    super(`ESPN NFL returned an invalid ${resource} payload`);
    this.name = "EspnNflPayloadError";
  }
}

class CanonicalIdentityRegistry {
  private readonly mappings = new Map<string, SourceMapping>();
  private readonly usedKeys = new Set<string>();

  constructor(
    knownMappings: SourceMapping[],
    private readonly createId: () => CanonicalId,
  ) {
    for (const mapping of knownMappings) {
      if (mapping.provider === "espn") {
        this.mappings.set(this.key(mapping.entityType, mapping.externalId), mapping);
      }
    }
  }

  resolve(entityType: SourceEntityType, externalId: string) {
    const key = this.key(entityType, externalId);
    this.usedKeys.add(key);
    const existing = this.mappings.get(key);

    if (existing) {
      return existing.canonicalId;
    }

    const mapping: SourceMapping = {
      provider: "espn",
      entityType,
      externalId,
      canonicalId: this.createId(),
    };
    this.mappings.set(key, mapping);
    return mapping.canonicalId;
  }

  values() {
    return [...this.usedKeys].map((key) => this.mappings.get(key)!);
  }

  private key(entityType: SourceEntityType, externalId: string) {
    return `${entityType}\u0000${externalId}`;
  }
}

function athleteIdFromReference(reference: string) {
  const match = reference.match(/\/athletes\/(\d+)(?:\?|$)/);
  return match?.[1] ?? null;
}

function teamIdFromReference(reference: string) {
  const match = reference.match(/\/teams\/(\d+)(?:\?|$)/);
  return match?.[1] ?? null;
}

function parseInteger(value: string | undefined) {
  if (!value || value === "--") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new EspnNflPayloadError("box-score statistic");
  }

  return parsed;
}

function parseMadeAttempts(value: string | undefined) {
  const [made, attempted] = value?.split("/") ?? [];
  const madeCount = parseInteger(made);
  const attemptCount = parseInteger(attempted);
  return { made: madeCount, missed: Math.max(0, attemptCount - madeCount) };
}

function fieldGoalDistance(play: z.infer<typeof playSchema>) {
  if (play.statYardage !== undefined && play.statYardage > 0) {
    return play.statYardage;
  }

  const textDistance = play.text?.match(/\b(\d+)\s+yard field goal/i)?.[1];

  if (textDistance) {
    return Number.parseInt(textDistance, 10);
  }

  throw new EspnNflPayloadError("field-goal distance");
}

function emptyStats(
  externalPlayerId: string,
  playerId: CanonicalId,
  nflGameId: CanonicalId,
  nflTeamId: CanonicalId,
): MutableStats {
  return {
    externalPlayerId,
    playerId,
    nflGameId,
    nflTeamId,
    passingAttempts: 0,
    passingCompletions: 0,
    passingYards: 0,
    passingTouchdowns: 0,
    passingInterceptions: 0,
    rushingAttempts: 0,
    rushingYards: 0,
    rushingTouchdowns: 0,
    receptions: 0,
    receivingTargets: 0,
    receivingYards: 0,
    receivingTouchdowns: 0,
    fumbles: 0,
    fumblesLost: 0,
    passingTwoPointConversions: 0,
    rushingTwoPointConversions: 0,
    receivingTwoPointConversions: 0,
    extraPointsMade: 0,
    extraPointsMissed: 0,
    madeFieldGoalDistances: [],
    missedFieldGoalDistances: [],
  };
}

function valuesByLabel(labels: string[], stats: string[]) {
  return new Map(labels.map((label, index) => [label, stats[index]]));
}

function requiredValue(
  values: Map<string, string | undefined>,
  label: string,
) {
  const value = values.get(label);

  if (value === undefined) {
    throw new EspnNflPayloadError(`box-score ${label} statistic`);
  }

  return value;
}

function applyBoxscoreGroup(
  stats: MutableStats,
  groupName: string,
  labels: string[],
  values: string[],
) {
  const byLabel = valuesByLabel(labels, values);

  if (groupName === "passing") {
    const [completions, attempts] = requiredValue(
      byLabel,
      "C/ATT",
    ).split("/");
    stats.passingCompletions = parseInteger(completions);
    stats.passingAttempts = parseInteger(attempts);
    stats.passingYards = parseInteger(requiredValue(byLabel, "YDS"));
    stats.passingTouchdowns = parseInteger(requiredValue(byLabel, "TD"));
    stats.passingInterceptions = parseInteger(
      requiredValue(byLabel, "INT"),
    );
  } else if (groupName === "rushing") {
    stats.rushingAttempts = parseInteger(requiredValue(byLabel, "CAR"));
    stats.rushingYards = parseInteger(requiredValue(byLabel, "YDS"));
    stats.rushingTouchdowns = parseInteger(requiredValue(byLabel, "TD"));
  } else if (groupName === "receiving") {
    stats.receptions = parseInteger(requiredValue(byLabel, "REC"));
    stats.receivingTargets = parseInteger(
      requiredValue(byLabel, "TGTS"),
    );
    stats.receivingYards = parseInteger(requiredValue(byLabel, "YDS"));
    stats.receivingTouchdowns = parseInteger(
      requiredValue(byLabel, "TD"),
    );
  } else if (groupName === "fumbles") {
    stats.fumbles = parseInteger(requiredValue(byLabel, "FUM"));
    stats.fumblesLost = parseInteger(requiredValue(byLabel, "LOST"));
  } else if (groupName === "kicking") {
    const extraPoints = parseMadeAttempts(requiredValue(byLabel, "XP"));
    stats.extraPointsMade = extraPoints.made;
    stats.extraPointsMissed = extraPoints.missed;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

export class EspnNflSource implements NflSource {
  readonly provider = "espn";
  private readonly fetchImplementation: typeof fetch;
  private readonly createId: () => CanonicalId;
  private readonly concurrency: number;

  constructor(options: EspnNflSourceOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.createId = options.createId ?? randomUUID;
    this.concurrency = options.concurrency ?? 6;
  }

  async fetchPlayerStats(
    input: FetchPlayerStatsInput,
  ): Promise<PlayerStatsImportSnapshot> {
    const scoringPeriods = [...new Set(input.scoringPeriods)].sort(
      (left, right) => left - right,
    );
    const relevantByExternalId = new Map(
      input.relevantPlayers.map((player) => [player.externalId, player]),
    );
    const identities = new CanonicalIdentityRegistry(
      input.knownMappings,
      this.createId,
    );
    const nflTeams = new Map<CanonicalId, NflTeam>();
    const events = (
      await mapWithConcurrency(
        scoringPeriods,
        this.concurrency,
        async (week) => {
          const payload = await this.getJson(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${input.year}&seasontype=2&week=${week}`,
            "scoreboard",
          );
          const parsed = scoreboardSchema.safeParse(payload);

          if (!parsed.success) {
            throw new EspnNflPayloadError("scoreboard");
          }

          return parsed.data.events;
        },
      )
    ).flat();
    const uniqueEvents = [
      ...new Map(events.map((event) => [event.id, event])).values(),
    ];
    const gameResults = await mapWithConcurrency(
      uniqueEvents,
      this.concurrency,
      async (event) => {
        const competition = event.competitions[0];
        const teamsByExternalId = new Map<string, CanonicalId>();

        for (const competitor of competition.competitors) {
          const teamId = identities.resolve(
            "nfl_team",
            competitor.team.id,
          );
          teamsByExternalId.set(competitor.team.id, teamId);
          nflTeams.set(teamId, {
            id: teamId,
            abbreviation: competitor.team.abbreviation,
            displayName: competitor.team.displayName,
          });
        }

        const home = competition.competitors.find(
          (competitor) => competitor.homeAway === "home",
        );
        const away = competition.competitors.find(
          (competitor) => competitor.homeAway === "away",
        );

        if (!home || !away) {
          throw new EspnNflPayloadError("scoreboard competition");
        }

        const nflGameId = identities.resolve("nfl_game", event.id);
        const [summaryPayload, playsPayload] = await Promise.all([
          this.getJson(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event.id}`,
            "game summary",
          ),
          this.getJson(
            `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${event.id}/competitions/${event.id}/plays?limit=500`,
            "play-by-play",
          ),
        ]);
        const summary = boxscoreSchema.safeParse(summaryPayload);
        const plays = playsSchema.safeParse(playsPayload);

        if (!summary.success) {
          throw new EspnNflPayloadError("game summary");
        }

        if (!plays.success) {
          throw new EspnNflPayloadError("play-by-play");
        }

        const statsByExternalId = new Map<string, MutableStats>();

        for (const teamBoxscore of summary.data.boxscore.players) {
          const nflTeamId = teamsByExternalId.get(teamBoxscore.team.id);

          if (!nflTeamId) {
            throw new EspnNflPayloadError("box-score team");
          }

          for (const group of teamBoxscore.statistics) {
            if (
              group.name !== "passing" &&
              group.name !== "rushing" &&
              group.name !== "receiving" &&
              group.name !== "fumbles" &&
              group.name !== "kicking"
            ) {
              continue;
            }

            for (const athlete of group.athletes) {
              const relevantPlayer = relevantByExternalId.get(
                athlete.athlete.id,
              );

              if (!relevantPlayer) {
                continue;
              }

              const stats =
                statsByExternalId.get(athlete.athlete.id) ??
                emptyStats(
                  athlete.athlete.id,
                  relevantPlayer.id,
                  nflGameId,
                  nflTeamId,
                );
              applyBoxscoreGroup(
                stats,
                group.name,
                group.labels,
                athlete.stats,
              );
              statsByExternalId.set(athlete.athlete.id, stats);
            }
          }
        }

        for (const play of plays.data.items) {
          const participants = new Map(
            play.participants.flatMap((participant) => {
              const athleteId = athleteIdFromReference(
                participant.athlete.$ref,
              );
              return athleteId ? [[participant.type, athleteId]] : [];
            }),
          );
          const ensureStats = (externalPlayerId: string | undefined) => {
            if (!externalPlayerId) {
              return null;
            }

            const relevantPlayer =
              relevantByExternalId.get(externalPlayerId);

            if (!relevantPlayer) {
              return null;
            }

            const existing = statsByExternalId.get(externalPlayerId);

            if (existing) {
              return existing;
            }

            const externalTeamId = play.team
              ? teamIdFromReference(play.team.$ref)
              : null;
            const playerTeamId = externalTeamId
              ? teamsByExternalId.get(externalTeamId)
              : undefined;

            if (!playerTeamId) {
              throw new EspnNflPayloadError("play participant team");
            }

            const created = emptyStats(
              externalPlayerId,
              relevantPlayer.id,
              nflGameId,
              playerTeamId,
            );
            statsByExternalId.set(externalPlayerId, created);
            return created;
          };
          const playType = play.type?.text ?? "";

          if (/Field Goal/i.test(playType)) {
            const kickerStats = ensureStats(participants.get("kicker"));

            if (kickerStats) {
              const distance = fieldGoalDistance(play);

              if (/Good/i.test(playType)) {
                kickerStats.madeFieldGoalDistances.push(distance);
              } else {
                kickerStats.missedFieldGoalDistances.push(distance);
              }
            }
          }

          if (play.pointAfterAttempt?.value === 2) {
            const scorerId = participants.get("patScorer");

            if (/Pass/i.test(play.pointAfterAttempt.text)) {
              const passerStats = ensureStats(
                participants.get("patPasser"),
              );
              const receiverStats = ensureStats(scorerId);

              if (passerStats) {
                passerStats.passingTwoPointConversions += 1;
              }

              if (receiverStats) {
                receiverStats.receivingTwoPointConversions += 1;
              }
            } else if (/Rush/i.test(play.pointAfterAttempt.text)) {
              const rusherStats = ensureStats(scorerId);

              if (rusherStats) {
                rusherStats.rushingTwoPointConversions += 1;
              }
            }
          }
        }

        return {
          game: {
            id: nflGameId,
            seasonYear: input.year,
            seasonType: event.season.type,
            week: event.week.number,
            startsAt: event.date,
            homeNflTeamId: teamsByExternalId.get(home.team.id)!,
            awayNflTeamId: teamsByExternalId.get(away.team.id)!,
            completed: competition.status.type.completed,
          },
          stats: [...statsByExternalId.values()].map(
            ({ externalPlayerId, ...stats }) => {
              void externalPlayerId;
              return stats;
            },
          ),
        };
      },
    );

    return playerStatsImportSnapshotSchema.parse({
      seasonYear: input.year,
      nflTeams: [...nflTeams.values()],
      games: gameResults.map((result) => result.game),
      playerStats: gameResults.flatMap((result) => result.stats),
      sourceMappings: identities.values(),
    });
  }

  private async getJson(url: string, resource: string): Promise<unknown> {
    const response = await this.fetchImplementation(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new EspnNflHttpError(response.status, resource);
    }

    try {
      return await response.json();
    } catch {
      throw new EspnNflPayloadError(resource);
    }
  }
}
