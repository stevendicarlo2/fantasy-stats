import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import type {
  FantasySource,
  FetchSeasonInput,
} from "@/application/ports/fantasy-source";
import { seasonImportSnapshotSchema } from "@/domain/schemas";
import type {
  CanonicalId,
  MatchupPhase,
  SeasonImportSnapshot,
  SourceEntityType,
  SourceMapping,
} from "@/domain/types";

const espnMemberSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const espnTeamSchema = z.object({
  id: z.int(),
  name: z.string().trim().min(1),
  owners: z.array(z.string()).optional(),
  primaryOwner: z.string().optional(),
});

const espnMatchupSideSchema = z.object({
  teamId: z.int(),
  totalPoints: z.number(),
});

const espnMatchupSchema = z.object({
  id: z.int(),
  matchupPeriodId: z.int().positive(),
  playoffTierType: z
    .enum([
      "NONE",
      "WINNERS_BRACKET",
      "WINNERS_CONSOLATION_LADDER",
      "LOSERS_CONSOLATION_LADDER",
    ])
    .optional(),
  home: espnMatchupSideSchema,
  away: espnMatchupSideSchema.optional(),
});

const espnLeagueSchema = z.object({
  id: z.int(),
  seasonId: z.int(),
  members: z.array(espnMemberSchema),
  teams: z.array(espnTeamSchema),
  schedule: z.array(espnMatchupSchema),
  settings: z.object({
    name: z.string().trim().min(1),
    size: z.int().min(2),
    scheduleSettings: z.object({
      matchupPeriodCount: z.int().positive(),
      playoffTeamCount: z.int().positive(),
    }),
  }),
  status: z.object({
    firstScoringPeriod: z.int().positive(),
  }),
});

type EspnLeague = z.infer<typeof espnLeagueSchema>;
type EspnMatchup = z.infer<typeof espnMatchupSchema>;

export interface EspnSourceOptions {
  leagueId: number;
  earliestSeason: number;
  espnS2: string;
  swid: string;
  fetchImplementation?: typeof fetch;
  diagnosticsDirectory?: string;
}

export class EspnAuthenticationError extends Error {
  constructor() {
    super("ESPN rejected the configured private-league authentication");
    this.name = "EspnAuthenticationError";
  }
}

export class EspnHttpError extends Error {
  constructor(status: number) {
    super(`ESPN request failed with HTTP status ${status}`);
    this.name = "EspnHttpError";
  }
}

export class EspnPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EspnPayloadError";
  }
}

export class EspnMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EspnMappingError";
  }
}

class CanonicalIdentityRegistry {
  private readonly mappings = new Map<string, SourceMapping>();
  private readonly usedKeys = new Set<string>();

  constructor(knownMappings: SourceMapping[]) {
    for (const mapping of knownMappings) {
      if (mapping.provider !== "espn") {
        continue;
      }

      this.mappings.set(this.key(mapping.entityType, mapping.externalId), mapping);
    }
  }

  resolve(entityType: SourceEntityType, externalId: string): CanonicalId {
    const key = this.key(entityType, externalId);
    this.usedKeys.add(key);
    const existing = this.mappings.get(key);

    if (existing) {
      return existing.canonicalId;
    }

    const mapping = {
      provider: "espn",
      entityType,
      externalId,
      canonicalId: randomUUID(),
    } satisfies SourceMapping;

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

function buildEspnUrl(leagueId: number, year: number) {
  const base =
    year >= 2018
      ? `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`
      : `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/${leagueId}`;
  const url = new URL(base);

  if (year < 2018) {
    url.searchParams.set("seasonId", String(year));
  }

  for (const view of [
    "mSettings",
    "mTeam",
    "mMatchup",
    "mMatchupScore",
    "mScoreboard",
  ]) {
    url.searchParams.append("view", view);
  }

  return url;
}

function summarizePayload(payload: unknown) {
  const unwrapped = Array.isArray(payload) ? payload[0] : payload;

  if (!unwrapped || typeof unwrapped !== "object") {
    return { responseShape: Array.isArray(payload) ? "array" : typeof payload };
  }

  const record = unwrapped as Record<string, unknown>;

  return {
    responseShape: Array.isArray(payload) ? "array" : "object",
    topLevelKeys: Object.keys(record).sort(),
    teamCount: Array.isArray(record.teams) ? record.teams.length : null,
    matchupCount: Array.isArray(record.schedule)
      ? record.schedule.length
      : null,
  };
}

async function writePayloadDiagnostic(
  directory: string,
  year: number,
  payload: unknown,
  issues: z.core.$ZodIssue[],
) {
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const diagnostic = {
    recordedAt: new Date().toISOString(),
    seasonYear: year,
    issues: issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    })),
    structure: summarizePayload(payload),
  };

  await writeFile(
    resolve(directory, `${year}-${timestamp}.json`),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

function unwrapLeaguePayload(payload: unknown, year: number) {
  if (year < 2018) {
    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new EspnPayloadError(
        `ESPN legacy season ${year} did not return one league record`,
      );
    }

    return payload[0];
  }

  return payload;
}

function externalId(
  leagueId: number,
  entityType: SourceEntityType,
  providerId: number | string,
  year?: number,
) {
  if (entityType === "league") {
    return String(leagueId);
  }

  if (entityType === "season") {
    return `${leagueId}:${providerId}`;
  }

  if (entityType === "matchup") {
    return `${leagueId}:${year}:${providerId}`;
  }

  return `${leagueId}:${providerId}`;
}

function classifyPostseasonMatchup(
  matchup: EspnMatchup,
): MatchupPhase {
  if (matchup.playoffTierType === "WINNERS_BRACKET") {
    return "playoff";
  }

  if (
    matchup.playoffTierType === "WINNERS_CONSOLATION_LADDER" ||
    matchup.playoffTierType === "LOSERS_CONSOLATION_LADDER"
  ) {
    return "consolation";
  }

  throw new EspnMappingError(
    `ESPN postseason matchup ${matchup.id} has no recognized bracket tier`,
  );
}

function mapLeagueToSnapshot(
  league: EspnLeague,
  year: number,
  configuredLeagueId: number,
  knownMappings: SourceMapping[],
): SeasonImportSnapshot {
  if (league.id !== configuredLeagueId || league.seasonId !== year) {
    throw new EspnMappingError(
      "ESPN returned a different league or season than requested",
    );
  }

  if (league.settings.size !== league.teams.length) {
    throw new EspnMappingError(
      "ESPN league size does not match the returned team count",
    );
  }

  const identities = new CanonicalIdentityRegistry(knownMappings);
  const leagueId = identities.resolve(
    "league",
    externalId(configuredLeagueId, "league", configuredLeagueId),
  );
  const seasonId = identities.resolve(
    "season",
    externalId(configuredLeagueId, "season", year),
  );
  const memberNameById = new Map(
    league.members.map((member) => [
      member.id,
      member.displayName ??
        ([member.firstName, member.lastName].filter(Boolean).join(" ") ||
          null),
    ]),
  );
  const franchiseIdByTeam = new Map(
    league.teams.map((team) => [
      team.id,
      identities.resolve(
        "franchise",
        externalId(configuredLeagueId, "franchise", team.id),
      ),
    ]),
  );
  const franchises = league.teams.map((team) => {
    const ownerId = team.primaryOwner ?? team.owners?.[0];

    return {
      id: franchiseIdByTeam.get(team.id)!,
      leagueId,
      ownerName: ownerId ? (memberNameById.get(ownerId) ?? null) : null,
    };
  });
  const matchups = league.schedule.map((matchup) => {
    const homeFranchiseId = franchiseIdByTeam.get(matchup.home.teamId);
    const awayFranchiseId = matchup.away
      ? franchiseIdByTeam.get(matchup.away.teamId)
      : null;

    if (!homeFranchiseId || (matchup.away && !awayFranchiseId)) {
      throw new EspnMappingError(
        `ESPN matchup ${matchup.id} references an unknown team`,
      );
    }

    return {
      id: identities.resolve(
        "matchup",
        externalId(configuredLeagueId, "matchup", matchup.id, year),
      ),
      seasonId,
      week: matchup.matchupPeriodId,
      phase:
        matchup.matchupPeriodId <=
        league.settings.scheduleSettings.matchupPeriodCount
          ? ("regular" as const)
          : classifyPostseasonMatchup(matchup),
      homeFranchiseId,
      awayFranchiseId,
    };
  });
  const matchupIdByProviderId = new Map(
    league.schedule.map((matchup, index) => [
      matchup.id,
      matchups[index].id,
    ]),
  );
  const scores = league.schedule.flatMap((matchup) => {
    const matchupId = matchupIdByProviderId.get(matchup.id)!;
    const homeFranchiseId = franchiseIdByTeam.get(matchup.home.teamId)!;
    const matchupScores = [
      {
        matchupId,
        franchiseId: homeFranchiseId,
        score: Math.round(matchup.home.totalPoints * 100) / 100,
      },
    ];

    if (matchup.away) {
      matchupScores.push({
        matchupId,
        franchiseId: franchiseIdByTeam.get(matchup.away.teamId)!,
        score: Math.round(matchup.away.totalPoints * 100) / 100,
      });
    }

    return matchupScores;
  });

  return seasonImportSnapshotSchema.parse({
    league: {
      id: leagueId,
      name: league.settings.name,
    },
    season: {
      id: seasonId,
      leagueId,
      year,
      teamCount: league.settings.size,
      regularSeasonStartWeek: league.status.firstScoringPeriod,
      regularSeasonEndWeek:
        league.settings.scheduleSettings.matchupPeriodCount,
    },
    franchises,
    franchiseNames: league.teams.map((team) => ({
      franchiseId: franchiseIdByTeam.get(team.id)!,
      name: team.name,
    })),
    matchups,
    scores,
    sourceMappings: identities.values(),
  });
}

export class EspnFantasySource implements FantasySource {
  readonly provider = "espn";
  private readonly fetchImplementation: typeof fetch;
  private readonly diagnosticsDirectory: string;

  constructor(private readonly options: EspnSourceOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.diagnosticsDirectory =
      options.diagnosticsDirectory ??
      resolve(process.cwd(), ".diagnostics", "espn");
  }

  async fetchSeason(input: FetchSeasonInput): Promise<SeasonImportSnapshot> {
    if (input.year < this.options.earliestSeason) {
      throw new EspnMappingError(
        `Season ${input.year} precedes the configured earliest season`,
      );
    }

    const response = await this.fetchImplementation(
      buildEspnUrl(this.options.leagueId, input.year),
      {
        headers: {
          Accept: "application/json",
          Cookie: `espn_s2=${this.options.espnS2}; SWID=${this.options.swid}`,
        },
      },
    );

    if (response.status === 401 || response.status === 403) {
      throw new EspnAuthenticationError();
    }

    if (!response.ok) {
      throw new EspnHttpError(response.status);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new EspnPayloadError("ESPN returned a non-JSON response");
    }

    const leaguePayload = unwrapLeaguePayload(payload, input.year);
    const parsed = espnLeagueSchema.safeParse(leaguePayload);

    if (!parsed.success) {
      try {
        await writePayloadDiagnostic(
          this.diagnosticsDirectory,
          input.year,
          payload,
          parsed.error.issues,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown diagnostic error";
        throw new EspnPayloadError(
          `ESPN payload validation failed and diagnostic writing failed: ${message}`,
        );
      }

      throw new EspnPayloadError(
        "ESPN payload validation failed; a redacted local diagnostic was written",
      );
    }

    return mapLeagueToSnapshot(
      parsed.data,
      input.year,
      this.options.leagueId,
      input.knownMappings,
    );
  }
}
