import { describe, expect, it, vi } from "vitest";

import { EspnNflHttpError, EspnNflPayloadError, EspnNflSource } from "./espn-nfl-source";

const ids = {
  quarterback: "10000000-0000-4000-8000-000000000001",
  kicker: "10000000-0000-4000-8000-000000000002",
  homeTeam: "10000000-0000-4000-8000-000000000003",
  awayTeam: "10000000-0000-4000-8000-000000000004",
  game: "10000000-0000-4000-8000-000000000005",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validScoreboardEvent(
  overrides: {
    competitors?: unknown[];
  } = {},
) {
  return {
    id: "401000001",
    date: "2025-09-07T17:00:00Z",
    season: { type: 2 },
    week: { number: 1 },
    competitions: [
      {
        competitors: overrides.competitors ?? [
          {
            homeAway: "home",
            team: {
              id: "1",
              abbreviation: "ATL",
              displayName: "Atlanta Falcons",
            },
          },
          {
            homeAway: "away",
            team: {
              id: "2",
              abbreviation: "BUF",
              displayName: "Buffalo Bills",
            },
          },
        ],
        status: { type: { completed: true } },
      },
    ],
  };
}

const emptyPlays = { items: [] };
const emptySummary = { boxscore: { players: [] } };

describe("EspnNflSource", () => {
  it("maps relevant box-score players and structured kicking plays", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({
          events: [
            {
              id: "401000001",
              date: "2025-09-07T17:00:00Z",
              season: { type: 2 },
              week: { number: 1 },
              competitions: [
                {
                  competitors: [
                    {
                      homeAway: "home",
                      team: {
                        id: "1",
                        abbreviation: "ATL",
                        displayName: "Atlanta Falcons",
                      },
                    },
                    {
                      homeAway: "away",
                      team: {
                        id: "2",
                        abbreviation: "BUF",
                        displayName: "Buffalo Bills",
                      },
                    },
                  ],
                  status: { type: { completed: true } },
                },
              ],
            },
          ],
        });
      }

      if (url.includes("/summary?")) {
        return jsonResponse({
          boxscore: {
            players: [
              {
                team: { id: "1" },
                statistics: [
                  {
                    name: "passing",
                    labels: [
                      "C/ATT",
                      "YDS",
                      "AVG",
                      "TD",
                      "INT",
                    ],
                    athletes: [
                      {
                        athlete: { id: "101" },
                        stats: ["20/30", "250", "8.3", "2", "1"],
                      },
                    ],
                  },
                  {
                    name: "kicking",
                    labels: ["FG", "PCT", "LONG", "XP", "PTS"],
                    athletes: [
                      {
                        athlete: { id: "102" },
                        stats: ["1/2", "50", "47", "2/3", "5"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }

      return jsonResponse({
        items: [
          {
            type: { text: "Field Goal Good" },
            statYardage: 47,
            team: {
              $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/1?lang=en",
            },
            participants: [
              {
                athlete: {
                  $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/athletes/102?lang=en",
                },
                type: "kicker",
              },
            ],
          },
          {
            type: { text: "Field Goal Missed" },
            statYardage: 52,
            team: {
              $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/1?lang=en",
            },
            participants: [
              {
                athlete: {
                  $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/athletes/102?lang=en",
                },
                type: "kicker",
              },
            ],
          },
          {
            type: { text: "Blocked Field Goal" },
            statYardage: -8,
            text: "Synthetic kicker 45 yard field goal is BLOCKED.",
            team: {
              $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/1?lang=en",
            },
            participants: [
              {
                athlete: {
                  $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/athletes/102?lang=en",
                },
                type: "kicker",
              },
            ],
          },
          {
            type: { text: "Passing Touchdown" },
            team: {
              $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/1?lang=en",
            },
            pointAfterAttempt: {
              text: "Two Point Pass",
              value: 2,
            },
            participants: [
              {
                athlete: {
                  $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/athletes/101?lang=en",
                },
                type: "patPasser",
              },
            ],
          },
        ],
      });
    });
    const createdIds = [ids.homeTeam, ids.awayTeam, ids.game];
    const source = new EspnNflSource({
      fetchImplementation,
      createId: () => createdIds.shift()!,
      concurrency: 1,
    });

    const result = await source.fetchPlayerStats({
      year: 2025,
      scoringPeriods: [1],
      relevantPlayers: [
        { id: ids.quarterback, externalId: "101" },
        { id: ids.kicker, externalId: "102" },
      ],
      knownMappings: [],
    });

    expect(result.games).toEqual([
      expect.objectContaining({
        id: ids.game,
        week: 1,
        completed: true,
        homeNflTeamId: ids.homeTeam,
        awayNflTeamId: ids.awayTeam,
      }),
    ]);
    expect(result.playerStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: ids.quarterback,
          passingAttempts: 30,
          passingCompletions: 20,
          passingYards: 250,
          passingTouchdowns: 2,
          passingInterceptions: 1,
          passingTwoPointConversions: 1,
        }),
        expect.objectContaining({
          playerId: ids.kicker,
          extraPointsMade: 2,
          extraPointsMissed: 1,
          madeFieldGoalDistances: [47],
          missedFieldGoalDistances: [52, 45],
        }),
      ]),
    );
  });

  it("does not create rows for irrelevant box-score players", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({ events: [] });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const source = new EspnNflSource({ fetchImplementation });

    const result = await source.fetchPlayerStats({
      year: 2025,
      scoringPeriods: [1],
      relevantPlayers: [],
      knownMappings: [],
    });

    expect(result.games).toEqual([]);
    expect(result.playerStats).toEqual([]);
    expect(result.nflTeams).toEqual([]);
  });

  it("throws EspnNflHttpError when the scoreboard request fails", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ message: "internal error" }, 500),
    );
    const source = new EspnNflSource({ fetchImplementation });

    await expect(
      source.fetchPlayerStats({
        year: 2025,
        scoringPeriods: [1],
        relevantPlayers: [],
        knownMappings: [],
      }),
    ).rejects.toThrow(EspnNflHttpError);
  });

  it("throws EspnNflPayloadError for a malformed scoreboard payload", async () => {
    const fetchImplementation = vi.fn(async () =>
      jsonResponse({ events: [{ id: "401000001" }] }),
    );
    const source = new EspnNflSource({ fetchImplementation });

    await expect(
      source.fetchPlayerStats({
        year: 2025,
        scoringPeriods: [1],
        relevantPlayers: [],
        knownMappings: [],
      }),
    ).rejects.toThrow(EspnNflPayloadError);
  });

  it("throws EspnNflPayloadError when a competition is missing a home or away competitor", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({
          events: [
            validScoreboardEvent({
              competitors: [
                {
                  homeAway: "home",
                  team: {
                    id: "1",
                    abbreviation: "ATL",
                    displayName: "Atlanta Falcons",
                  },
                },
              ],
            }),
          ],
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const source = new EspnNflSource({ fetchImplementation });

    await expect(
      source.fetchPlayerStats({
        year: 2025,
        scoringPeriods: [1],
        relevantPlayers: [],
        knownMappings: [],
      }),
    ).rejects.toThrow(EspnNflPayloadError);
  });

  it("throws EspnNflPayloadError when box-score references a team missing from the scoreboard", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({ events: [validScoreboardEvent()] });
      }

      if (url.includes("/summary?")) {
        return jsonResponse({
          boxscore: {
            players: [{ team: { id: "999" }, statistics: [] }],
          },
        });
      }

      return jsonResponse(emptyPlays);
    });
    const source = new EspnNflSource({ fetchImplementation });

    await expect(
      source.fetchPlayerStats({
        year: 2025,
        scoringPeriods: [1],
        relevantPlayers: [],
        knownMappings: [],
      }),
    ).rejects.toThrow(EspnNflPayloadError);
  });

  it("throws EspnNflPayloadError when a required box-score stat label is missing", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({ events: [validScoreboardEvent()] });
      }

      if (url.includes("/summary?")) {
        return jsonResponse({
          boxscore: {
            players: [
              {
                team: { id: "1" },
                statistics: [
                  {
                    name: "passing",
                    labels: ["YDS"],
                    athletes: [
                      { athlete: { id: "101" }, stats: ["250"] },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }

      return jsonResponse(emptyPlays);
    });
    const source = new EspnNflSource({ fetchImplementation });

    await expect(
      source.fetchPlayerStats({
        year: 2025,
        scoringPeriods: [1],
        relevantPlayers: [{ id: ids.quarterback, externalId: "101" }],
        knownMappings: [],
      }),
    ).rejects.toThrow("box-score C/ATT statistic");
  });

  it("records a rushing two-point conversion for the scorer", async () => {
    const fetchImplementation = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("/scoreboard?")) {
        return jsonResponse({ events: [validScoreboardEvent()] });
      }

      if (url.includes("/summary?")) {
        return jsonResponse(emptySummary);
      }

      return jsonResponse({
        items: [
          {
            type: { text: "Rushing Touchdown" },
            team: {
              $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/1?lang=en",
            },
            pointAfterAttempt: {
              text: "Two Point Rush",
              value: 2,
            },
            participants: [
              {
                athlete: {
                  $ref: "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2025/athletes/103?lang=en",
                },
                type: "patScorer",
              },
            ],
          },
        ],
      });
    });
    const createdIds = [ids.homeTeam, ids.awayTeam, ids.game];
    const source = new EspnNflSource({
      fetchImplementation,
      createId: () => createdIds.shift()!,
      concurrency: 1,
    });

    const result = await source.fetchPlayerStats({
      year: 2025,
      scoringPeriods: [1],
      relevantPlayers: [
        { id: ids.quarterback, externalId: "103" },
      ],
      knownMappings: [],
    });

    expect(result.playerStats).toEqual([
      expect.objectContaining({
        playerId: ids.quarterback,
        rushingTwoPointConversions: 1,
      }),
    ]);
  });
});
