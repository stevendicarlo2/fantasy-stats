import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SourceMapping } from "@/domain/types";

import {
  EspnAuthenticationError,
  EspnFantasySource,
  EspnMappingError,
  EspnPayloadError,
} from "./espn-source";

const knownIds = {
  league: "10000000-0000-4000-8000-000000000001",
  home: "10000000-0000-4000-8000-000000000002",
};

function createLeaguePayload(year: number) {
  return {
    id: 123456,
    seasonId: year,
    members: [
      {
        id: "member-1",
        displayName: "Synthetic Owner One",
      },
      {
        id: "member-2",
        firstName: "Synthetic",
        lastName: "Owner Two",
      },
    ],
    teams: [
      {
        id: 1,
        name: "Synthetic Team One",
        owners: ["member-1"],
        primaryOwner: "member-1",
      },
      {
        id: 2,
        name: "Synthetic Team Two",
        owners: ["member-2"],
        primaryOwner: "member-2",
      },
    ],
    schedule: [
      {
        id: 1,
        matchupPeriodId: 1,
        home: { teamId: 1, totalPoints: 101.234 },
        away: { teamId: 2, totalPoints: 99.876 },
      },
    ],
    settings: {
      name: "Synthetic League",
      size: 2,
      scheduleSettings: {
        matchupPeriodCount: 1,
        playoffTeamCount: 1,
      },
    },
    status: {
      firstScoringPeriod: 1,
    },
  };
}

function createSource(
  payload: unknown,
  options: {
    status?: number;
    diagnosticsDirectory?: string;
    onRequest?: (url: URL) => void;
  } = {},
) {
  const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
    options.onRequest?.(new URL(String(input)));

    return new Response(JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return new EspnFantasySource({
    leagueId: 123456,
    earliestSeason: 2017,
    espnS2: "synthetic-s2",
    swid: "{00000000-0000-0000-0000-000000000000}",
    fetchImplementation,
    diagnosticsDirectory: options.diagnosticsDirectory,
  });
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true }),
    ),
  );
});

interface RouteResponse {
  body: unknown;
  status?: number;
}

function createRoutedSource(
  handler: (url: URL) => RouteResponse | undefined,
  options: { earliestSeason?: number; diagnosticsDirectory?: string } = {},
) {
  const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const route = handler(url);

    if (!route) {
      throw new Error(`Unhandled synthetic ESPN request: ${url.toString()}`);
    }

    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return new EspnFantasySource({
    leagueId: 123456,
    earliestSeason: options.earliestSeason ?? 2017,
    espnS2: "synthetic-s2",
    swid: "{00000000-0000-0000-0000-000000000000}",
    fetchImplementation,
    diagnosticsDirectory: options.diagnosticsDirectory,
  });
}

function createSettingsPayload(overrides: {
  matchupPeriods?: Record<string, number[]>;
  matchupPeriodCount?: number;
  isActive?: boolean;
  firstScoringPeriod?: number;
  latestScoringPeriod?: number;
} = {}) {
  return {
    id: 123456,
    seasonId: 2025,
    settings: {
      scheduleSettings: {
        matchupPeriodCount: overrides.matchupPeriodCount ?? 1,
        matchupPeriods: overrides.matchupPeriods ?? { "1": [1] },
      },
    },
    status: {
      isActive: overrides.isActive ?? false,
      firstScoringPeriod: overrides.firstScoringPeriod ?? 1,
      latestScoringPeriod: overrides.latestScoringPeriod ?? 1,
    },
  };
}

function rosterStat(
  scoringPeriodId: number,
  statSourceId: number,
  appliedTotal: number,
) {
  return { scoringPeriodId, statSourceId, statSplitTypeId: 1, appliedTotal };
}

function espnPlayer(overrides: {
  id: number;
  fullName: string;
  defaultPositionId: number;
  proTeamId: number;
  stats?: unknown[];
}) {
  return {
    id: overrides.id,
    fullName: overrides.fullName,
    defaultPositionId: overrides.defaultPositionId,
    proTeamId: overrides.proTeamId,
    stats: overrides.stats ?? [],
  };
}

function rosterEntry(lineupSlotId: number, player: ReturnType<typeof espnPlayer>) {
  return { lineupSlotId, playerPoolEntry: { player } };
}

describe("EspnFantasySource", () => {
  it("maps modern ESPN responses to canonical snapshots", async () => {
    const knownMappings: SourceMapping[] = [
      {
        provider: "espn",
        entityType: "league",
        canonicalId: knownIds.league,
        externalId: "123456",
      },
      {
        provider: "espn",
        entityType: "franchise",
        canonicalId: knownIds.home,
        externalId: "123456:1",
      },
      {
        provider: "espn",
        entityType: "matchup",
        canonicalId: "90000000-0000-4000-8000-000000000001",
        externalId: "123456:2024:99",
      },
    ];
    const source = createSource(createLeaguePayload(2025), {
      onRequest(url) {
        expect(url.pathname).toContain(
          "/seasons/2025/segments/0/leagues/123456",
        );
      },
    });

    const snapshot = await source.fetchSeason({
      year: 2025,
      knownMappings,
    });

    expect(snapshot.league.id).toBe(knownIds.league);
    expect(snapshot.franchises[0]).toEqual({
      id: knownIds.home,
      leagueId: knownIds.league,
      ownerName: "Synthetic Owner One",
    });
    expect(snapshot.scores.map((score) => score.score)).toEqual([
      101.23, 99.88,
    ]);
    expect(snapshot.sourceMappings).not.toContainEqual(
      knownMappings[2],
    );
  });

  it("unwraps legacy league history responses", async () => {
    const source = createSource([createLeaguePayload(2017)], {
      onRequest(url) {
        expect(url.pathname).toContain("/leagueHistory/123456");
        expect(url.searchParams.get("seasonId")).toBe("2017");
      },
    });

    const snapshot = await source.fetchSeason({
      year: 2017,
      knownMappings: [],
    });

    expect(snapshot.season.year).toBe(2017);
    expect(snapshot.matchups).toHaveLength(1);
  });

  it("maps postseason playoff and consolation byes", async () => {
    const payload = createLeaguePayload(2025);
    payload.schedule.push(
      {
        id: 2,
        matchupPeriodId: 2,
        playoffTierType: "WINNERS_BRACKET" as const,
        home: { teamId: 1, totalPoints: 120 },
      } as unknown as (typeof payload.schedule)[number],
      {
        id: 3,
        matchupPeriodId: 2,
        playoffTierType: "LOSERS_CONSOLATION_LADDER" as const,
        home: { teamId: 2, totalPoints: 80 },
      } as unknown as (typeof payload.schedule)[number],
    );
    const source = createSource(payload);

    const snapshot = await source.fetchSeason({
      year: 2025,
      knownMappings: [],
    });
    const postseason = snapshot.matchups.filter(
      (matchup) => matchup.week === 2,
    );

    expect(postseason.map((matchup) => matchup.phase)).toEqual([
      "playoff",
      "consolation",
    ]);
    expect(
      postseason.every((matchup) => matchup.awayFranchiseId === null),
    ).toBe(true);
    expect(
      snapshot.scores.filter((score) =>
        postseason.some((matchup) => matchup.id === score.matchupId),
      ),
    ).toHaveLength(2);
  });

  it("surfaces authentication rejection without exposing cookies", async () => {
    const source = createSource({}, { status: 401 });

    await expect(
      source.fetchSeason({ year: 2025, knownMappings: [] }),
    ).rejects.toThrow(EspnAuthenticationError);
    await expect(
      source.fetchSeason({ year: 2025, knownMappings: [] }),
    ).rejects.not.toThrow("synthetic-s2");
  });

  it("writes only redacted structural diagnostics for invalid payloads", async () => {
    const diagnosticsDirectory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-espn-diagnostics-"),
    );
    temporaryDirectories.push(diagnosticsDirectory);
    const source = createSource(
      { privateTeamName: "MUST_NOT_BE_WRITTEN" },
      { diagnosticsDirectory },
    );

    await expect(
      source.fetchSeason({ year: 2025, knownMappings: [] }),
    ).rejects.toThrow(EspnPayloadError);

    const files = await readdir(diagnosticsDirectory);
    expect(files).toHaveLength(1);
    const diagnostic = await readFile(
      join(diagnosticsDirectory, files[0]),
      "utf8",
    );
    expect(diagnostic).not.toContain("MUST_NOT_BE_WRITTEN");
    expect(diagnostic).toContain("topLevelKeys");
  });
});

describe("EspnFantasySource fetchRosters", () => {
  it("reports 2017 rosters as unavailable without making any request", async () => {
    const source = createRoutedSource(() => undefined);

    const result = await source.fetchRosters({
      year: 2017,
      knownMappings: [],
    });

    expect(result.availability).toBe("unavailable");
    if (result.availability === "unavailable") {
      expect(result.reason).toMatch(/2017/);
    }
  });

  it("rejects a season before the configured earliest season without a request", async () => {
    const source = createRoutedSource(() => undefined, {
      earliestSeason: 2019,
    });

    await expect(
      source.fetchRosters({ year: 2018, knownMappings: [] }),
    ).rejects.toThrow(EspnMappingError);
  });

  it("maps starters, bench, IR, D/ST, and a missing projection to null", async () => {
    const settings = createSettingsPayload();
    const rosterPayload = {
      teams: [
        {
          id: 1,
          roster: {
            entries: [
              rosterEntry(
                0,
                espnPlayer({
                  id: 101,
                  fullName: "Starter Quarterback",
                  defaultPositionId: 1,
                  proTeamId: 1,
                  stats: [
                    rosterStat(1, 0, 15.5),
                    rosterStat(1, 1, 14.2),
                  ],
                }),
              ),
              rosterEntry(
                20,
                espnPlayer({
                  id: 102,
                  fullName: "Bench Runningback",
                  defaultPositionId: 2,
                  proTeamId: 2,
                  stats: [rosterStat(1, 0, 5)],
                }),
              ),
              rosterEntry(
                21,
                espnPlayer({
                  id: 103,
                  fullName: "Injured Tightend",
                  defaultPositionId: 4,
                  proTeamId: 3,
                  stats: [
                    rosterStat(1, 0, 0),
                    rosterStat(1, 1, 3.3),
                  ],
                }),
              ),
              rosterEntry(
                16,
                espnPlayer({
                  id: 9999,
                  fullName: "Baltimore Ravens",
                  defaultPositionId: 16,
                  proTeamId: 33,
                  stats: [rosterStat(1, 0, 8)],
                }),
              ),
            ],
          },
        },
      ],
    };
    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") {
        return { body: settings };
      }

      if (view === "mRoster") {
        return { body: rosterPayload };
      }

      return undefined;
    });

    const result = await source.fetchRosters({
      year: 2025,
      knownMappings: [],
    });

    if (result.availability !== "available") {
      throw new Error("expected roster data to be available");
    }

    const { snapshot } = result;
    expect(snapshot.entries).toHaveLength(4);
    expect(snapshot.rosters).toEqual([
      {
        seasonId: snapshot.seasonId,
        scoringPeriod: 1,
        franchiseId: snapshot.entries[0].franchiseId,
        state: "final",
      },
    ]);

    const byLineupSlot = Object.fromEntries(
      snapshot.entries.map((entry) => [entry.lineupSlot, entry]),
    );
    expect(byLineupSlot.QB.actualFantasyPoints).toBe(15.5);
    expect(byLineupSlot.QB.projectedFantasyPoints).toBe(14.2);
    expect(byLineupSlot.BE.projectedFantasyPoints).toBeNull();
    expect(byLineupSlot.IR.lineupSlot).toBe("IR");
    expect(byLineupSlot.DST.actualFantasyPoints).toBe(8);

    const dstPlayerId = byLineupSlot.DST.playerId;
    const dstPlayer = snapshot.players.find(
      (player) => player.id === dstPlayerId,
    );
    expect(dstPlayer?.kind).toBe("team_defense");
    expect(dstPlayer?.displayName).toBe("Baltimore Ravens");
    expect(snapshot.sourceMappings).toContainEqual(
      expect.objectContaining({
        entityType: "player",
        externalId: "team-defense:33",
        canonicalId: dstPlayerId,
      }),
    );
    expect(
      snapshot.nflTeams.find((team) => team.abbreviation === "BAL"),
    ).toBeDefined();
    expect(snapshot.positionRanges).toContainEqual({
      playerId: byLineupSlot.QB.playerId,
      seasonId: snapshot.seasonId,
      position: "QB",
      startScoringPeriod: 1,
      endScoringPeriod: 1,
    });
    expect(snapshot.positionRanges).toContainEqual({
      playerId: dstPlayerId,
      seasonId: snapshot.seasonId,
      position: "DST",
      startScoringPeriod: 1,
      endScoringPeriod: 1,
    });
  });

  it("splits an NFL-team and position range across an unobserved scoring period", async () => {
    const settings = createSettingsPayload({
      matchupPeriodCount: 3,
      matchupPeriods: { "1": [1], "2": [2], "3": [3] },
    });
    const rosteredPlayer = espnPlayer({
      id: 201,
      fullName: "Consistent Quarterback",
      defaultPositionId: 1,
      proTeamId: 1,
      stats: [rosterStat(1, 0, 10)],
    });
    const rosterByPeriod: Record<number, unknown> = {
      1: { teams: [{ id: 1, roster: { entries: [rosterEntry(0, rosteredPlayer)] } }] },
      2: { teams: [{ id: 1, roster: { entries: [] } }] },
      3: {
        teams: [
          {
            id: 1,
            roster: {
              entries: [
                rosterEntry(0, {
                  ...rosteredPlayer,
                  stats: [rosterStat(3, 0, 12)],
                }),
              ],
            },
          },
        ],
      },
    };
    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") {
        return { body: settings };
      }

      if (view === "mRoster") {
        const scoringPeriod = Number(
          url.searchParams.get("scoringPeriodId"),
        );
        return { body: rosterByPeriod[scoringPeriod] };
      }

      return undefined;
    });

    const result = await source.fetchRosters({
      year: 2025,
      knownMappings: [],
    });

    if (result.availability !== "available") {
      throw new Error("expected roster data to be available");
    }

    const { snapshot } = result;
    expect(snapshot.rosters).toHaveLength(3);
    expect(snapshot.entries).toHaveLength(2);

    const playerId = snapshot.entries[0].playerId;
    expect(snapshot.nflTeamRanges).toEqual([
      {
        playerId,
        seasonId: snapshot.seasonId,
        nflTeamId: snapshot.nflTeamRanges[0].nflTeamId,
        startScoringPeriod: 1,
        endScoringPeriod: 1,
      },
      {
        playerId,
        seasonId: snapshot.seasonId,
        nflTeamId: snapshot.nflTeamRanges[0].nflTeamId,
        startScoringPeriod: 3,
        endScoringPeriod: 3,
      },
    ]);
    expect(snapshot.positionRanges).toEqual([
      {
        playerId,
        seasonId: snapshot.seasonId,
        position: "QB",
        startScoringPeriod: 1,
        endScoringPeriod: 1,
      },
      {
        playerId,
        seasonId: snapshot.seasonId,
        position: "QB",
        startScoringPeriod: 3,
        endScoringPeriod: 3,
      },
    ]);
  });
});

describe("EspnFantasySource fetchTransactions", () => {
  function catalogPlayer(
    id: number,
    overrides: {
      fullName?: string;
      defaultPositionId?: number;
      proTeamId?: number;
    } = {},
  ) {
    return {
      player: {
        id,
        fullName: overrides.fullName ?? `Player ${id}`,
        defaultPositionId: overrides.defaultPositionId ?? 2,
        proTeamId: overrides.proTeamId ?? 1,
      },
    };
  }

  it("reports 2017 transactions and drafts as unavailable without making any request", async () => {
    const source = createRoutedSource(() => undefined);

    const result = await source.fetchTransactions({
      year: 2017,
      knownMappings: [],
    });

    expect(result.availability).toBe("unavailable");
    if (result.availability === "unavailable") {
      expect(result.reason).toMatch(/2017/);
    }
  });

  it("retains executed moves, a failed waiver, and an ownership-changing administrative item, while excluding pending/canceled/lineup/roster-only/trade-negotiation records", async () => {
    const settings = createSettingsPayload();
    const draftPayload = {
      draftDetail: {
        picks: [
          {
            id: 1,
            teamId: 1,
            playerId: 301,
            roundId: 1,
            roundPickNumber: 1,
            overallPickNumber: 1,
            keeper: false,
            bidAmount: 0,
          },
          {
            id: 2,
            teamId: 2,
            playerId: 302,
            roundId: 1,
            roundPickNumber: 2,
            overallPickNumber: 2,
            keeper: true,
          },
        ],
      },
    };
    const transactionsPayload = {
      transactions: [
        {
          id: "t1",
          type: "FREEAGENT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          teamId: 1,
          proposedDate: 1000,
          processDate: 2000,
          items: [{ playerId: 401, type: "ADD", toTeamId: 1 }],
        },
        {
          id: "t2",
          type: "WAIVER",
          status: "EXECUTED",
          scoringPeriodId: 1,
          teamId: 2,
          bidAmount: 15,
          proposedDate: 1100,
          processDate: 2100,
          items: [
            { playerId: 402, type: "ADD", toTeamId: 2 },
            { playerId: 403, type: "DROP", fromTeamId: 2 },
          ],
        },
        {
          id: "t3",
          type: "WAIVER",
          status: "FAILED_ROSTERLOCK",
          scoringPeriodId: 1,
          teamId: 3,
          bidAmount: 5,
          proposedDate: 1200,
          items: [
            { playerId: 404, type: "ADD", toTeamId: 3 },
            { playerId: 405, type: "DROP", fromTeamId: 3 },
          ],
        },
        {
          id: "t4",
          type: "WAIVER",
          status: "PENDING",
          scoringPeriodId: 1,
          teamId: 4,
          items: [{ playerId: 406, type: "ADD", toTeamId: 4 }],
        },
        {
          id: "t5",
          type: "FREEAGENT",
          status: "CANCELED",
          scoringPeriodId: 1,
          teamId: 1,
          items: [{ playerId: 407, type: "ADD", toTeamId: 1 }],
        },
        {
          id: "t6",
          type: "LINEUP",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ playerId: 408, type: "ADD", toTeamId: 1 }],
        },
        {
          id: "t7",
          type: "FUTURE_ROSTER",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [],
        },
        {
          id: "t8",
          type: "RETRO_ROSTER",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [],
        },
        {
          id: "t9",
          type: "TRADE_PROPOSAL",
          status: "PENDING",
          scoringPeriodId: 1,
          items: [{ playerId: 409, type: "TRADE", fromTeamId: 1, toTeamId: 2 }],
        },
        {
          id: "t10",
          type: "TRADE_DECLINE",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ playerId: 409, type: "TRADE", fromTeamId: 1, toTeamId: 2 }],
        },
        {
          id: "t11",
          type: "ROSTER",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ playerId: 410, type: "DROP", fromTeamId: 5, toTeamId: 0 }],
        },
        {
          id: "t12",
          type: "ROSTER",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [{ playerId: 411, type: "ADD", fromTeamId: 6, toTeamId: 6 }],
        },
      ],
    };
    const catalogPayload = {
      players: [301, 401, 403, 404, 405, 406, 407, 408, 409, 410, 411].map(
        (id) => catalogPlayer(id),
      ),
    };
    catalogPayload.players.push(
      catalogPlayer(302, {
        fullName: "Houston Texans",
        defaultPositionId: 16,
        proTeamId: 34,
      }),
    );
    catalogPayload.players.push(catalogPlayer(402));

    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") return { body: settings };
      if (view === "mTransactions2") return { body: transactionsPayload };
      if (view === "mDraftDetail") return { body: draftPayload };
      if (view === "kona_player_info") return { body: catalogPayload };
      return undefined;
    });

    const result = await source.fetchTransactions({
      year: 2025,
      knownMappings: [],
    });

    if (result.availability !== "available") {
      throw new Error("expected transaction data to be available");
    }

    const { snapshot } = result;
    expect(snapshot.draftPicks).toHaveLength(2);
    const dstPick = snapshot.draftPicks.find(
      (pick) => pick.overallPick === 2,
    )!;
    expect(dstPick.keeper).toBe(true);
    expect(dstPick.auctionBid).toBeNull();
    const dstPlayer = snapshot.players.find(
      (player) => player.id === dstPick.playerId,
    );
    expect(dstPlayer?.kind).toBe("team_defense");
    expect(dstPlayer?.displayName).toBe("Houston Texans");
    const firstPick = snapshot.draftPicks.find(
      (pick) => pick.overallPick === 1,
    )!;
    expect(firstPick.keeper).toBe(false);
    expect(firstPick.auctionBid).toBe(0);

    expect(snapshot.transactions).toHaveLength(4);
    const byKind = Object.fromEntries(
      snapshot.transactions.map((transaction) => [
        transaction.kind === "waiver" && transaction.outcome === "failed"
          ? "failed_waiver"
          : transaction.kind,
        transaction,
      ]),
    );

    expect(byKind.free_agent.outcome).toBe("executed");
    expect(byKind.waiver.outcome).toBe("executed");
    expect(byKind.waiver.bidAmount).toBe(15);
    expect(byKind.failed_waiver.outcome).toBe("failed");
    expect(byKind.failed_waiver.failureReason).toBe("roster_lock");
    expect(byKind.failed_waiver.bidAmount).toBe(5);
    expect(byKind.administrative.outcome).toBe("executed");

    const administrativeItems = snapshot.transactionItems.filter(
      (item) => item.transactionId === byKind.administrative.id,
    );
    expect(administrativeItems).toHaveLength(1);
    expect(administrativeItems[0].action).toBe("drop");

    const failedWaiverItems = snapshot.transactionItems.filter(
      (item) => item.transactionId === byKind.failed_waiver.id,
    );
    expect(failedWaiverItems.map((item) => item.action)).toEqual([
      "add",
      "drop",
    ]);
  });

  it("collapses TRADE_ACCEPT and TRADE_UPHOLD records for one workflow into one executed trade", async () => {
    const settings = createSettingsPayload();
    const draftPayload = { draftDetail: { picks: [] } };
    const tradeItems = [
      { playerId: 601, type: "TRADE", fromTeamId: 1, toTeamId: 2 },
      { playerId: 602, type: "TRADE", fromTeamId: 2, toTeamId: 1 },
    ];
    const transactionsPayload = {
      transactions: [
        {
          id: "900",
          type: "TRADE_ACCEPT",
          status: "EXECUTED",
          scoringPeriodId: 1,
          relatedTransactionId: "800",
          proposedDate: 1000,
          processDate: 5000,
          items: tradeItems,
        },
        {
          id: "901",
          type: "TRADE_UPHOLD",
          status: "EXECUTED",
          scoringPeriodId: 1,
          relatedTransactionId: "800",
          processDate: 6000,
          items: tradeItems,
        },
      ],
    };
    const catalogPayload = {
      players: [601, 602].map((id) => catalogPlayer(id)),
    };
    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") return { body: settings };
      if (view === "mTransactions2") return { body: transactionsPayload };
      if (view === "mDraftDetail") return { body: draftPayload };
      if (view === "kona_player_info") return { body: catalogPayload };
      return undefined;
    });

    const result = await source.fetchTransactions({
      year: 2025,
      knownMappings: [],
    });

    if (result.availability !== "available") {
      throw new Error("expected transaction data to be available");
    }

    const { snapshot } = result;
    expect(snapshot.transactions).toHaveLength(1);
    const [trade] = snapshot.transactions;
    expect(trade.kind).toBe("trade");
    expect(trade.outcome).toBe("executed");
    expect(trade.proposedAt).toBe(new Date(1000).toISOString());
    expect(trade.processedAt).toBe(new Date(6000).toISOString());
    expect(trade.acceptedAt).toBe(new Date(5000).toISOString());
    expect(
      snapshot.transactionItems.filter(
        (item) => item.transactionId === trade.id,
      ),
    ).toHaveLength(2);
  });

  it("rejects an unrecognized transaction type", async () => {
    const settings = createSettingsPayload();
    const draftPayload = { draftDetail: { picks: [] } };
    const transactionsPayload = {
      transactions: [
        {
          id: "t1",
          type: "SOMETHING_NEW",
          status: "EXECUTED",
          scoringPeriodId: 1,
          items: [],
        },
      ],
    };
    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") return { body: settings };
      if (view === "mTransactions2") return { body: transactionsPayload };
      if (view === "mDraftDetail") return { body: draftPayload };
      if (view === "kona_player_info") return { body: { players: [] } };
      return undefined;
    });

    await expect(
      source.fetchTransactions({ year: 2025, knownMappings: [] }),
    ).rejects.toThrow(EspnMappingError);
  });

  it("rejects an unrecognized failed-waiver status", async () => {
    const settings = createSettingsPayload();
    const draftPayload = { draftDetail: { picks: [] } };
    const transactionsPayload = {
      transactions: [
        {
          id: "t1",
          type: "WAIVER",
          status: "FAILED_SOME_UNMAPPED_CODE",
          scoringPeriodId: 1,
          teamId: 1,
          items: [{ playerId: 701, type: "ADD", toTeamId: 1 }],
        },
      ],
    };
    const catalogPayload = { players: [catalogPlayer(701)] };
    const source = createRoutedSource((url) => {
      const view = url.searchParams.get("view");

      if (view === "mSettings") return { body: settings };
      if (view === "mTransactions2") return { body: transactionsPayload };
      if (view === "mDraftDetail") return { body: draftPayload };
      if (view === "kona_player_info") return { body: catalogPayload };
      return undefined;
    });

    await expect(
      source.fetchTransactions({ year: 2025, knownMappings: [] }),
    ).rejects.toThrow(EspnMappingError);
  });
});
