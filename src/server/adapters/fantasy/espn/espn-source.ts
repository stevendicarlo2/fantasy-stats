import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { SafeOperationalError } from "@/application/errors";
import type {
  FantasyRosterSource,
  FantasySource,
  FantasyTransactionSource,
  FetchSeasonInput,
} from "@/application/ports/fantasy-source";
import {
  rosterImportSnapshotSchema,
  seasonImportSnapshotSchema,
  transactionImportSnapshotSchema,
} from "@/domain/schemas";
import type {
  CanonicalId,
  DatasetSourceResult,
  DraftPick,
  FantasyTransaction,
  FantasyTransactionAction,
  FantasyTransactionFailureReason,
  FantasyTransactionItem,
  IsoDateTime,
  MatchupPhase,
  NflTeam,
  Player,
  PlayerNflTeamRange,
  PlayerPosition,
  PlayerPositionRange,
  RosterImportSnapshot,
  RosterSnapshotState,
  SeasonImportSnapshot,
  SourceEntityType,
  SourceMapping,
  TransactionImportSnapshot,
  WeeklyRosterEntry,
  WeeklyRosterSnapshot,
} from "@/domain/types";

import {
  isEspnTeamDefense,
  resolveEspnCanonicalPosition,
  resolveEspnLineupSlot,
} from "./espn-lineup";
import { resolveEspnProTeam } from "./espn-pro-teams";
import { buildObservationRanges } from "./espn-ranges";

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
      matchupPeriods: z
        .record(z.string(), z.array(z.int().positive()))
        .optional(),
    }),
  }),
  status: z.object({
    firstScoringPeriod: z.int().positive(),
  }),
});

type EspnLeague = z.infer<typeof espnLeagueSchema>;
type EspnMatchup = z.infer<typeof espnMatchupSchema>;

const espnLeagueSettingsResponseSchema = z.object({
  id: z.int(),
  seasonId: z.int(),
  settings: z.object({
    scheduleSettings: z.object({
      matchupPeriodCount: z.int().positive(),
      matchupPeriods: z
        .record(z.string(), z.array(z.int().positive()))
        .optional(),
    }),
  }),
  status: z.object({
    isActive: z.boolean(),
    firstScoringPeriod: z.int().positive(),
    latestScoringPeriod: z.int().positive().optional(),
  }),
});

type EspnLeagueSettingsResponse = z.infer<
  typeof espnLeagueSettingsResponseSchema
>;

const espnRosterPlayerStatSchema = z.object({
  scoringPeriodId: z.int().nonnegative(),
  statSourceId: z.int(),
  statSplitTypeId: z.int(),
  appliedTotal: z.number().optional(),
});

const espnRosterPlayerSchema = z.object({
  id: z.int(),
  fullName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  defaultPositionId: z.int(),
  proTeamId: z.int(),
  stats: z.array(espnRosterPlayerStatSchema).optional(),
});

const espnRosterEntrySchema = z.object({
  lineupSlotId: z.int(),
  playerPoolEntry: z.object({
    player: espnRosterPlayerSchema,
  }),
});

const espnRosterTeamSchema = z.object({
  id: z.int(),
  roster: z
    .object({
      entries: z.array(espnRosterEntrySchema),
    })
    .optional(),
});

const espnRosterResponseSchema = z.object({
  teams: z.array(espnRosterTeamSchema),
});

const espnDraftPickSchema = z.object({
  id: z.int(),
  teamId: z.int(),
  playerId: z.int(),
  roundId: z.int().positive(),
  roundPickNumber: z.int().positive(),
  overallPickNumber: z.int().positive(),
  keeper: z.boolean().optional(),
  bidAmount: z.number().nonnegative().optional(),
});

const espnDraftDetailResponseSchema = z.object({
  draftDetail: z.object({
    picks: z.array(espnDraftPickSchema),
  }),
});

const espnTransactionItemSchema = z.object({
  playerId: z.int(),
  type: z.string(),
  fromTeamId: z.int().nullable().optional(),
  toTeamId: z.int().nullable().optional(),
});

const espnTransactionSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  scoringPeriodId: z.int().positive(),
  teamId: z.int().nullable().optional(),
  bidAmount: z.number().nonnegative().nullable().optional(),
  proposedDate: z.number().nonnegative().nullable().optional(),
  processDate: z.number().nonnegative().nullable().optional(),
  relatedTransactionId: z.string().nullable().optional(),
  items: z.array(espnTransactionItemSchema).optional(),
});

const espnTransactionsResponseSchema = z.object({
  transactions: z.array(espnTransactionSchema).optional(),
});

type EspnTransaction = z.infer<typeof espnTransactionSchema>;
type EspnTransactionItem = z.infer<typeof espnTransactionItemSchema>;

const espnCatalogPlayerSchema = z.object({
  id: z.int(),
  fullName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  defaultPositionId: z.int(),
  proTeamId: z.int(),
});

const espnPlayerCatalogResponseSchema = z.object({
  players: z.array(
    z.object({
      player: espnCatalogPlayerSchema,
    }),
  ),
});

type EspnCatalogPlayer = z.infer<typeof espnCatalogPlayerSchema>;

export interface EspnSourceOptions {
  leagueId: number;
  earliestSeason: number;
  espnS2: string;
  swid: string;
  fetchImplementation?: typeof fetch;
  diagnosticsDirectory?: string;
}

export class EspnAuthenticationError extends SafeOperationalError {
  constructor() {
    super("ESPN rejected the configured private-league authentication");
    this.name = "EspnAuthenticationError";
  }
}

export class EspnHttpError extends SafeOperationalError {
  constructor(status: number) {
    super(`ESPN request failed with HTTP status ${status}`);
    this.name = "EspnHttpError";
  }
}

export class EspnPayloadError extends SafeOperationalError {
  constructor(message: string) {
    super(message);
    this.name = "EspnPayloadError";
  }
}

export class EspnMappingError extends SafeOperationalError {
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

// The roster, transaction, draft, and player-catalog operations are only
// ever invoked for 2018+ seasons, so these builders never need the legacy
// leagueHistory branch that buildEspnUrl supports for fetchSeason.
function buildLeagueViewUrl(leagueId: number, year: number, views: string[]) {
  const url = new URL(
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`,
  );

  for (const view of views) {
    url.searchParams.append("view", view);
  }

  return url;
}

function buildSettingsUrl(leagueId: number, year: number) {
  return buildLeagueViewUrl(leagueId, year, ["mSettings"]);
}

function buildRosterUrl(
  leagueId: number,
  year: number,
  scoringPeriodId: number,
) {
  const url = buildLeagueViewUrl(leagueId, year, ["mRoster"]);
  url.searchParams.set("scoringPeriodId", String(scoringPeriodId));
  return url;
}

function buildDraftDetailUrl(leagueId: number, year: number) {
  return buildLeagueViewUrl(leagueId, year, ["mDraftDetail"]);
}

function buildTransactionsUrl(
  leagueId: number,
  year: number,
  scoringPeriodId: number,
) {
  const url = buildLeagueViewUrl(leagueId, year, ["mTransactions2"]);
  url.searchParams.set("scoringPeriodId", String(scoringPeriodId));
  return url;
}

function buildPlayerCatalogUrl(leagueId: number, year: number) {
  return buildLeagueViewUrl(leagueId, year, ["kona_player_info"]);
}

function resolveScoringPeriods(
  settings: EspnLeagueSettingsResponse,
): number[] {
  const { matchupPeriods, matchupPeriodCount } =
    settings.settings.scheduleSettings;
  const periods = matchupPeriods
    ? Object.values(matchupPeriods).flat()
    : Array.from({ length: matchupPeriodCount }, (_, index) => index + 1);

  return [...new Set(periods)].sort((left, right) => left - right);
}

function resolveRosterState(
  scoringPeriod: number,
  settings: EspnLeagueSettingsResponse,
): RosterSnapshotState {
  if (!settings.status.isActive) {
    return "final";
  }

  const currentScoringPeriod =
    settings.status.latestScoringPeriod ?? settings.status.firstScoringPeriod;

  return scoringPeriod < currentScoringPeriod ? "final" : "provisional";
}

function resolveDisplayName(
  fullName: string | undefined,
  firstName: string | undefined,
  lastName: string | undefined,
  fallbackExternalId: string,
): string {
  if (fullName) {
    return fullName;
  }

  const combined = [firstName, lastName].filter(Boolean).join(" ");
  return combined.length > 0 ? combined : `Player ${fallbackExternalId}`;
}

const EXCLUDED_TRANSACTION_TYPES = new Set([
  "FUTURE_ROSTER",
  "RETRO_ROSTER",
  "LINEUP",
  "DRAFT",
  "TRADE_PROPOSAL",
  "TRADE_DECLINE",
  "TRADE_VETO",
]);

const WAIVER_FAILURE_REASON_BY_ESPN_STATUS: Record<
  string,
  FantasyTransactionFailureReason
> = {
  AUCTION_BUDGET_EXCEEDED: "auction_budget_exceeded",
  FAILED_AUCTIONBUDGETEXCEEDED: "auction_budget_exceeded",
  INVALID_PLAYER_SOURCE: "invalid_player_source",
  FAILED_INVALIDPLAYERSOURCE: "invalid_player_source",
  INVALID_IR_SLOT: "invalid_ir_slot",
  FAILED_IRSLOT: "invalid_ir_slot",
  MATCHUP_ACQUISITION_LIMIT: "matchup_acquisition_limit",
  FAILED_MATCHUPACQUISITIONLIMIT: "matchup_acquisition_limit",
  PLAYER_ALREADY_DROPPED: "player_already_dropped",
  FAILED_PLAYERALREADYDROPPED: "player_already_dropped",
  ROSTER_LIMIT: "roster_limit",
  FAILED_ROSTERLIMIT: "roster_limit",
  ROSTER_LOCK: "roster_lock",
  FAILED_ROSTERLOCK: "roster_lock",
};

function transactionItemAction(
  type: EspnTransactionItem["type"],
): FantasyTransactionAction {
  if (type === "ADD") {
    return "add";
  }

  if (type === "DROP") {
    return "drop";
  }

  if (type === "TRADE") {
    return "trade";
  }

  throw new EspnMappingError(
    `ESPN transaction item has an unrecognized type ${type}`,
  );
}

function toIsoOrNull(
  epochMilliseconds: number | null | undefined,
): IsoDateTime | null {
  return epochMilliseconds === null || epochMilliseconds === undefined
    ? null
    : new Date(epochMilliseconds).toISOString();
}

function earliestOrNull(values: (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length > 0 ? Math.min(...present) : null;
}

function latestOrNull(values: (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length > 0 ? Math.max(...present) : null;
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

  if (
    entityType === "matchup" ||
    entityType === "transaction" ||
    entityType === "draft_pick"
  ) {
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
      playoffTeamCount:
        league.settings.scheduleSettings.playoffTeamCount,
      regularSeasonStartWeek: league.status.firstScoringPeriod,
      regularSeasonEndWeek:
        league.settings.scheduleSettings.matchupPeriodCount,
    },
    franchises,
    franchiseNames: league.teams.map((team) => ({
      franchiseId: franchiseIdByTeam.get(team.id)!,
      name: team.name,
    })),
    seasonFranchiseNames: league.teams.map((team) => ({
      franchiseId: franchiseIdByTeam.get(team.id)!,
      name: team.name,
    })),
    matchups,
    matchupScoringPeriods: matchups.flatMap((matchup) =>
      (
        league.settings.scheduleSettings.matchupPeriods?.[
          String(matchup.week)
        ] ?? [matchup.week]
      ).map((scoringPeriod) => ({
        matchupId: matchup.id,
        scoringPeriod,
      })),
    ),
    scores,
    sourceMappings: identities.values(),
  });
}

export class EspnFantasySource
  implements FantasySource, FantasyRosterSource, FantasyTransactionSource
{
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

  async fetchRosters(
    input: FetchSeasonInput,
  ): Promise<DatasetSourceResult<RosterImportSnapshot>> {
    this.assertSupportedSeason(input.year);

    if (input.year < 2018) {
      return {
        availability: "unavailable",
        reason:
          `ESPN's legacy season ${input.year} response returns the same ` +
          "final-season roster for every scoringPeriodId and cannot support " +
          "distinct historical weekly rosters or projections",
      };
    }

    const leagueId = this.options.leagueId;
    const settings = await this.fetchLeagueSettings(input.year);
    const scoringPeriods = resolveScoringPeriods(settings);
    const identities = new CanonicalIdentityRegistry(input.knownMappings);
    const seasonId = identities.resolve(
      "season",
      externalId(leagueId, "season", input.year),
    );
    const players = new Map<CanonicalId, Player>();
    const nflTeams = new Map<CanonicalId, NflTeam>();
    const rosters: WeeklyRosterSnapshot[] = [];
    const entries: WeeklyRosterEntry[] = [];
    const nflTeamObservations = new Map<
      CanonicalId,
      { scoringPeriod: number; value: CanonicalId }[]
    >();
    const positionObservations = new Map<
      CanonicalId,
      { scoringPeriod: number; value: PlayerPosition }[]
    >();

    for (const scoringPeriod of scoringPeriods) {
      const payload = await this.requestJson(
        buildRosterUrl(leagueId, input.year, scoringPeriod),
        espnRosterResponseSchema,
        input.year,
      );
      const state = resolveRosterState(scoringPeriod, settings);

      for (const team of payload.teams) {
        const franchiseId = identities.resolve(
          "franchise",
          externalId(leagueId, "franchise", team.id),
        );

        rosters.push({ seasonId, scoringPeriod, franchiseId, state });

        const rosterEntries = team.roster?.entries ?? [];

        rosterEntries.forEach((entry, rosterOrder) => {
          const player = entry.playerPoolEntry.player;
          const isTeamDefense = isEspnTeamDefense(player.defaultPositionId);
          const externalPlayerId = isTeamDefense
            ? `team-defense:${player.proTeamId}`
            : String(player.id);
          const playerId = identities.resolve("player", externalPlayerId);

          if (!players.has(playerId)) {
            players.set(playerId, {
              id: playerId,
              kind: isTeamDefense ? "team_defense" : "athlete",
              displayName: resolveDisplayName(
                player.fullName,
                player.firstName,
                player.lastName,
                externalPlayerId,
              ),
              firstName: player.firstName ?? null,
              lastName: player.lastName ?? null,
            });
          }

          if (player.proTeamId > 0) {
            const nflTeamId = identities.resolve(
              "nfl_team",
              String(player.proTeamId),
            );

            if (!nflTeams.has(nflTeamId)) {
              nflTeams.set(nflTeamId, {
                id: nflTeamId,
                ...resolveEspnProTeam(player.proTeamId),
              });
            }

            const observations = nflTeamObservations.get(playerId) ?? [];
            observations.push({ scoringPeriod, value: nflTeamId });
            nflTeamObservations.set(playerId, observations);
          }

          const canonicalPosition = resolveEspnCanonicalPosition(
            player.defaultPositionId,
          );

          if (canonicalPosition) {
            const observations = positionObservations.get(playerId) ?? [];
            observations.push({
              scoringPeriod,
              value: canonicalPosition,
            });
            positionObservations.set(playerId, observations);
          }

          const lineupSlot = resolveEspnLineupSlot(entry.lineupSlotId);
          const actualStat = player.stats?.find(
            (stat) =>
              stat.scoringPeriodId === scoringPeriod &&
              stat.statSourceId === 0 &&
              stat.statSplitTypeId === 1,
          );
          const projectedStat = player.stats?.find(
            (stat) =>
              stat.scoringPeriodId === scoringPeriod &&
              stat.statSourceId === 1 &&
              stat.statSplitTypeId === 1,
          );

          entries.push({
            seasonId,
            scoringPeriod,
            franchiseId,
            playerId,
            lineupSlot,
            rosterOrder,
            actualFantasyPoints: actualStat?.appliedTotal ?? 0,
            projectedFantasyPoints: projectedStat?.appliedTotal ?? null,
          });
        });
      }
    }

    const nflTeamRanges: PlayerNflTeamRange[] = [
      ...nflTeamObservations.entries(),
    ].flatMap(([playerId, observations]) =>
      buildObservationRanges(observations).map((range) => ({
        playerId,
        seasonId,
        nflTeamId: range.value,
        startScoringPeriod: range.startScoringPeriod,
        endScoringPeriod: range.endScoringPeriod,
      })),
    );
    const positionRanges: PlayerPositionRange[] = [
      ...positionObservations.entries(),
    ].flatMap(([playerId, observations]) =>
      buildObservationRanges(observations).map((range) => ({
        playerId,
        seasonId,
        position: range.value,
        startScoringPeriod: range.startScoringPeriod,
        endScoringPeriod: range.endScoringPeriod,
      })),
    );

    return {
      availability: "available",
      snapshot: rosterImportSnapshotSchema.parse({
        seasonId,
        seasonYear: input.year,
        players: [...players.values()],
        nflTeams: [...nflTeams.values()],
        rosters,
        entries,
        nflTeamRanges,
        positionRanges,
        sourceMappings: identities.values(),
      }),
    };
  }

  async fetchTransactions(
    input: FetchSeasonInput,
  ): Promise<DatasetSourceResult<TransactionImportSnapshot>> {
    this.assertSupportedSeason(input.year);

    if (input.year < 2018) {
      return {
        availability: "unavailable",
        reason:
          `ESPN's legacy season ${input.year} response does not expose a ` +
          "structured draft or transaction collection",
      };
    }

    const leagueId = this.options.leagueId;
    const settings = await this.fetchLeagueSettings(input.year);
    const scoringPeriods = resolveScoringPeriods(settings);
    const identities = new CanonicalIdentityRegistry(input.knownMappings);
    const seasonId = identities.resolve(
      "season",
      externalId(leagueId, "season", input.year),
    );
    const rawTransactionsById = new Map<string, EspnTransaction>();

    for (const scoringPeriod of scoringPeriods) {
      const payload = await this.requestJson(
        buildTransactionsUrl(leagueId, input.year, scoringPeriod),
        espnTransactionsResponseSchema,
        input.year,
      );

      for (const transaction of payload.transactions ?? []) {
        rawTransactionsById.set(transaction.id, transaction);
      }
    }

    const draftPayload = await this.requestJson(
      buildDraftDetailUrl(leagueId, input.year),
      espnDraftDetailResponseSchema,
      input.year,
    );
    const candidateExternalPlayerIds = new Set<number>();

    for (const pick of draftPayload.draftDetail.picks) {
      candidateExternalPlayerIds.add(pick.playerId);
    }

    for (const transaction of rawTransactionsById.values()) {
      for (const item of transaction.items ?? []) {
        candidateExternalPlayerIds.add(item.playerId);
      }
    }

    const catalog = await this.fetchPlayerCatalog(input.year, [
      ...candidateExternalPlayerIds,
    ]);
    const players = new Map<CanonicalId, Player>();
    const nflTeams = new Map<CanonicalId, NflTeam>();

    const resolvePlayer = (rawPlayerId: number): CanonicalId => {
      const meta = catalog.get(rawPlayerId);

      if (!meta) {
        throw new EspnMappingError(
          `ESPN referenced player ${rawPlayerId} without available catalog metadata`,
        );
      }

      const isTeamDefense = isEspnTeamDefense(meta.defaultPositionId);
      const externalPlayerId = isTeamDefense
        ? `team-defense:${meta.proTeamId}`
        : String(rawPlayerId);
      const playerId = identities.resolve("player", externalPlayerId);

      if (!players.has(playerId)) {
        players.set(playerId, {
          id: playerId,
          kind: isTeamDefense ? "team_defense" : "athlete",
          displayName: resolveDisplayName(
            meta.fullName,
            meta.firstName,
            meta.lastName,
            externalPlayerId,
          ),
          firstName: meta.firstName ?? null,
          lastName: meta.lastName ?? null,
        });
      }

      if (isTeamDefense && meta.proTeamId > 0) {
        const nflTeamId = identities.resolve(
          "nfl_team",
          String(meta.proTeamId),
        );

        if (!nflTeams.has(nflTeamId)) {
          nflTeams.set(nflTeamId, {
            id: nflTeamId,
            ...resolveEspnProTeam(meta.proTeamId),
          });
        }
      }

      return playerId;
    };
    const resolveFranchise = (
      teamId: number | null | undefined,
    ): CanonicalId | null =>
      teamId == null || teamId <= 0
        ? null
        : identities.resolve(
            "franchise",
            externalId(leagueId, "franchise", teamId),
          );
    const draftPicks: DraftPick[] = draftPayload.draftDetail.picks.map(
      (pick) => ({
        id: identities.resolve(
          "draft_pick",
          externalId(leagueId, "draft_pick", pick.id, input.year),
        ),
        seasonId,
        franchiseId: identities.resolve(
          "franchise",
          externalId(leagueId, "franchise", pick.teamId),
        ),
        playerId: resolvePlayer(pick.playerId),
        round: pick.roundId,
        roundPick: pick.roundPickNumber,
        overallPick: pick.overallPickNumber,
        keeper: pick.keeper ?? false,
        auctionBid: pick.bidAmount ?? null,
      }),
    );
    const transactions: FantasyTransaction[] = [];
    const transactionItems: FantasyTransactionItem[] = [];
    const tradeGroups = new Map<string, EspnTransaction[]>();

    const pushItems = (
      transactionId: CanonicalId,
      items: EspnTransactionItem[],
    ) => {
      items.forEach((item, ordinal) => {
        transactionItems.push({
          transactionId,
          ordinal,
          playerId: resolvePlayer(item.playerId),
          action: transactionItemAction(item.type),
          fromFranchiseId: resolveFranchise(item.fromTeamId),
          toFranchiseId: resolveFranchise(item.toTeamId),
        });
      });
    };

    for (const transaction of rawTransactionsById.values()) {
      if (
        transaction.type === "TRADE_ACCEPT" ||
        transaction.type === "TRADE_UPHOLD"
      ) {
        const groupKey = transaction.relatedTransactionId ?? transaction.id;
        const group = tradeGroups.get(groupKey) ?? [];
        group.push(transaction);
        tradeGroups.set(groupKey, group);
        continue;
      }

      if (EXCLUDED_TRANSACTION_TYPES.has(transaction.type)) {
        continue;
      }

      if (
        transaction.type === "FREEAGENT" ||
        transaction.type === "WAIVER"
      ) {
        const failureReason =
          WAIVER_FAILURE_REASON_BY_ESPN_STATUS[transaction.status];

        if (transaction.type === "WAIVER" && failureReason) {
          const transactionId = identities.resolve(
            "transaction",
            externalId(
              leagueId,
              "transaction",
              transaction.id,
              input.year,
            ),
          );

          transactions.push({
            id: transactionId,
            seasonId,
            scoringPeriod: transaction.scoringPeriodId,
            kind: "waiver",
            outcome: "failed",
            actingFranchiseId: resolveFranchise(transaction.teamId),
            proposedAt: toIsoOrNull(transaction.proposedDate),
            processedAt: toIsoOrNull(transaction.processDate),
            acceptedAt: null,
            bidAmount: transaction.bidAmount ?? null,
            failureReason,
          });
          pushItems(transactionId, transaction.items ?? []);
          continue;
        }

        if (
          transaction.type === "WAIVER" &&
          transaction.status.startsWith("FAILED_")
        ) {
          throw new EspnMappingError(
            `ESPN waiver transaction ${transaction.id} has an unrecognized failure status ${transaction.status}`,
          );
        }

        if (transaction.status !== "EXECUTED") {
          continue;
        }

        const transactionId = identities.resolve(
          "transaction",
          externalId(leagueId, "transaction", transaction.id, input.year),
        );

        transactions.push({
          id: transactionId,
          seasonId,
          scoringPeriod: transaction.scoringPeriodId,
          kind: transaction.type === "WAIVER" ? "waiver" : "free_agent",
          outcome: "executed",
          actingFranchiseId: resolveFranchise(transaction.teamId),
          proposedAt: toIsoOrNull(transaction.proposedDate),
          processedAt: toIsoOrNull(transaction.processDate),
          acceptedAt: null,
          bidAmount: transaction.bidAmount ?? null,
          failureReason: null,
        });
        pushItems(transactionId, transaction.items ?? []);
        continue;
      }

      if (transaction.type === "WAIVER_ERROR") {
        const failureReason =
          WAIVER_FAILURE_REASON_BY_ESPN_STATUS[transaction.status];

        if (!failureReason) {
          throw new EspnMappingError(
            `ESPN waiver transaction ${transaction.id} has an unrecognized failure status ${transaction.status}`,
          );
        }

        const transactionId = identities.resolve(
          "transaction",
          externalId(leagueId, "transaction", transaction.id, input.year),
        );

        transactions.push({
          id: transactionId,
          seasonId,
          scoringPeriod: transaction.scoringPeriodId,
          kind: "waiver",
          outcome: "failed",
          actingFranchiseId: resolveFranchise(transaction.teamId),
          proposedAt: toIsoOrNull(transaction.proposedDate),
          processedAt: toIsoOrNull(transaction.processDate),
          acceptedAt: null,
          bidAmount: transaction.bidAmount ?? null,
          failureReason,
        });
        pushItems(transactionId, transaction.items ?? []);
        continue;
      }

      if (transaction.type === "ROSTER") {
        const ownershipItems = (transaction.items ?? []).filter(
          (item) => (item.fromTeamId ?? 0) !== (item.toTeamId ?? 0),
        );

        if (ownershipItems.length === 0) {
          continue;
        }

        const transactionId = identities.resolve(
          "transaction",
          externalId(leagueId, "transaction", transaction.id, input.year),
        );

        transactions.push({
          id: transactionId,
          seasonId,
          scoringPeriod: transaction.scoringPeriodId,
          kind: "administrative",
          outcome: "executed",
          actingFranchiseId: null,
          proposedAt: toIsoOrNull(transaction.proposedDate),
          processedAt: toIsoOrNull(transaction.processDate),
          acceptedAt: null,
          bidAmount: null,
          failureReason: null,
        });
        pushItems(transactionId, ownershipItems);
        continue;
      }

      throw new EspnMappingError(
        `ESPN returned an unrecognized transaction type ${transaction.type}`,
      );
    }

    for (const [groupKey, group] of tradeGroups) {
      const transactionId = identities.resolve(
        "transaction",
        externalId(leagueId, "transaction", groupKey, input.year),
      );
      const acceptRecord = group.find(
        (candidate) => candidate.type === "TRADE_ACCEPT",
      );

      transactions.push({
        id: transactionId,
        seasonId,
        scoringPeriod: Math.min(
          ...group.map((record) => record.scoringPeriodId),
        ),
        kind: "trade",
        outcome: "executed",
        actingFranchiseId: null,
        proposedAt: toIsoOrNull(
          earliestOrNull(group.map((record) => record.proposedDate)),
        ),
        processedAt: toIsoOrNull(
          latestOrNull(group.map((record) => record.processDate)),
        ),
        acceptedAt: toIsoOrNull(acceptRecord?.processDate ?? null),
        bidAmount: null,
        failureReason: null,
      });

      const uniqueItems = new Map<string, EspnTransactionItem>();

      for (const record of group) {
        for (const item of record.items ?? []) {
          const key = `${item.playerId}\u0000${item.fromTeamId ?? ""}\u0000${item.toTeamId ?? ""}`;

          if (!uniqueItems.has(key)) {
            uniqueItems.set(key, item);
          }
        }
      }

      pushItems(transactionId, [...uniqueItems.values()]);
    }

    return {
      availability: "available",
      snapshot: transactionImportSnapshotSchema.parse({
        seasonId,
        seasonYear: input.year,
        players: [...players.values()],
        nflTeams: [...nflTeams.values()],
        draftPicks,
        transactions,
        transactionItems,
        sourceMappings: identities.values(),
      }),
    };
  }

  private assertSupportedSeason(year: number) {
    if (year < this.options.earliestSeason) {
      throw new EspnMappingError(
        `Season ${year} precedes the configured earliest season`,
      );
    }
  }

  private async fetchLeagueSettings(year: number) {
    return this.requestJson(
      buildSettingsUrl(this.options.leagueId, year),
      espnLeagueSettingsResponseSchema,
      year,
    );
  }

  private async fetchPlayerCatalog(
    year: number,
    externalPlayerIds: number[],
  ) {
    const catalog = new Map<number, EspnCatalogPlayer>();

    if (externalPlayerIds.length === 0) {
      return catalog;
    }

    const payload = await this.requestJson(
      buildPlayerCatalogUrl(this.options.leagueId, year),
      espnPlayerCatalogResponseSchema,
      year,
      {
        "x-fantasy-filter": JSON.stringify({
          players: { filterIds: { value: externalPlayerIds } },
        }),
      },
    );

    for (const entry of payload.players) {
      catalog.set(entry.player.id, entry.player);
    }

    return catalog;
  }

  private async requestJson<T>(
    url: URL,
    schema: z.ZodType<T>,
    year: number,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const response = await this.fetchImplementation(url, {
      headers: {
        Accept: "application/json",
        Cookie: `espn_s2=${this.options.espnS2}; SWID=${this.options.swid}`,
        ...extraHeaders,
      },
    });

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

    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      try {
        await writePayloadDiagnostic(
          this.diagnosticsDirectory,
          year,
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

    return parsed.data;
  }
}
