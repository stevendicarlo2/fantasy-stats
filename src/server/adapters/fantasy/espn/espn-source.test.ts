import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SourceMapping } from "@/domain/types";

import {
  EspnAuthenticationError,
  EspnFantasySource,
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
