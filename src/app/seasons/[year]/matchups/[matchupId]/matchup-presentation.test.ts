import { describe, expect, it } from "vitest";

import type {
  MatchupRosterPlayer,
  MatchupRosterPlayerGame,
  PlayerBoxScoreStats,
} from "@/domain/types";

import {
  buildMatchupComparisonRows,
  describeGameState,
  formatGameStatusLine,
  formatKickoffEastern,
  formatStatLine,
  summarizeTeamPlay,
} from "./matchup-presentation";

const NOW = new Date("2026-09-14T20:00:00Z");

function buildGame(
  overrides: Partial<MatchupRosterPlayerGame> = {},
): MatchupRosterPlayerGame {
  return {
    opponentAbbreviation: "IND",
    isHomeGame: false,
    startsAt: "2026-09-14T17:00:00Z",
    completed: false,
    stats: null,
    ...overrides,
  };
}

function buildStats(
  overrides: Partial<PlayerBoxScoreStats> = {},
): PlayerBoxScoreStats {
  return {
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
    ...overrides,
  };
}

function buildPlayer(
  overrides: Partial<MatchupRosterPlayer> = {},
): MatchupRosterPlayer {
  return {
    playerId: "player-1",
    playerKind: "athlete",
    displayName: "Test Player",
    lineupSlot: "QB",
    rosterOrder: 0,
    actualFantasyPoints: 0,
    projectedFantasyPoints: 10,
    position: "QB",
    nflTeamAbbreviation: "SF",
    game: null,
    ...overrides,
  };
}

describe("describeGameState", () => {
  it("returns bye when there is no game", () => {
    expect(describeGameState(null, NOW)).toBe("bye");
  });

  it("returns final when the game is completed", () => {
    expect(describeGameState(buildGame({ completed: true }), NOW)).toBe(
      "final",
    );
  });

  it("returns scheduled when kickoff is in the future", () => {
    const game = buildGame({ startsAt: "2026-09-15T17:00:00Z" });
    expect(describeGameState(game, NOW)).toBe("scheduled");
  });

  it("returns in_progress when kickoff has passed but game isn't complete", () => {
    const game = buildGame({ startsAt: "2026-09-14T17:00:00Z" });
    expect(describeGameState(game, NOW)).toBe("in_progress");
  });
});

describe("formatKickoffEastern", () => {
  it("formats an ISO timestamp in Eastern time with an ET suffix", () => {
    expect(formatKickoffEastern("2026-09-13T17:25:00Z")).toBe(
      "Sun 1:25 PM ET",
    );
  });
});

describe("formatGameStatusLine", () => {
  it("shows BYE when there is no game", () => {
    expect(formatGameStatusLine(null, "bye")).toBe("BYE");
  });

  it("shows opponent and kickoff time when scheduled", () => {
    const game = buildGame({
      opponentAbbreviation: "IND",
      isHomeGame: false,
      startsAt: "2026-09-13T17:25:00Z",
    });
    expect(formatGameStatusLine(game, "scheduled")).toBe(
      "@IND, Sun 1:25 PM ET",
    );
  });

  it("shows a home game with a vs prefix", () => {
    const game = buildGame({ opponentAbbreviation: "IND", isHomeGame: true });
    expect(formatGameStatusLine(game, "scheduled")).toContain("vs IND");
  });

  it("shows In Progress for a live game", () => {
    const game = buildGame({ opponentAbbreviation: "IND" });
    expect(formatGameStatusLine(game, "in_progress")).toBe(
      "@IND · In Progress",
    );
  });

  it("shows Final with no score for a completed game", () => {
    const game = buildGame({ opponentAbbreviation: "IND", completed: true });
    expect(formatGameStatusLine(game, "final")).toBe("@IND Final");
  });
});

describe("formatStatLine", () => {
  it("returns null when there are no stats", () => {
    expect(formatStatLine("QB", null)).toBeNull();
  });

  it("formats a QB stat line", () => {
    const stats = buildStats({
      passingYards: 205,
      passingTouchdowns: 3,
      passingInterceptions: 1,
    });
    expect(formatStatLine("QB", stats)).toBe(
      "205 YDS, 3 PASS TD, 1 INT",
    );
  });

  it("formats an RB stat line with no touchdowns", () => {
    const stats = buildStats({ rushingYards: 13 });
    expect(formatStatLine("RB", stats)).toBe("13 YDS");
  });

  it("formats an RB stat line with touchdowns", () => {
    const stats = buildStats({ rushingYards: 63, rushingTouchdowns: 2 });
    expect(formatStatLine("RB", stats)).toBe("63 YDS, 2 RUSH TD");
  });

  it("formats a WR stat line", () => {
    const stats = buildStats({ receptions: 5, receivingYards: 63 });
    expect(formatStatLine("WR", stats)).toBe("5 REC, 63 YDS");
  });

  it("formats a kicker stat line", () => {
    const stats = buildStats({
      madeFieldGoalDistances: [42],
      missedFieldGoalDistances: [51],
      extraPointsMade: 3,
      extraPointsMissed: 0,
    });
    expect(formatStatLine("K", stats)).toBe("1/2 FG, 3/3 XP");
  });

  it("returns null for D/ST regardless of stats", () => {
    expect(formatStatLine("DST", buildStats())).toBeNull();
  });
});

describe("summarizeTeamPlay", () => {
  it("counts in-play and to-play starters and sums the projected total", () => {
    const players = [
      buildPlayer({
        lineupSlot: "QB",
        actualFantasyPoints: 21.1,
        projectedFantasyPoints: 18,
        game: buildGame({ completed: true }),
      }),
      buildPlayer({
        lineupSlot: "RB",
        actualFantasyPoints: 5.4,
        projectedFantasyPoints: 12,
        game: buildGame({
          startsAt: "2026-09-14T17:00:00Z",
          completed: false,
        }),
      }),
      buildPlayer({
        lineupSlot: "WR",
        actualFantasyPoints: 0,
        projectedFantasyPoints: 8.8,
        game: buildGame({ startsAt: "2026-09-21T17:00:00Z" }),
      }),
      buildPlayer({
        lineupSlot: "BE",
        actualFantasyPoints: 30,
        projectedFantasyPoints: 30,
        game: buildGame({ completed: true }),
      }),
    ];

    expect(summarizeTeamPlay(players, NOW)).toEqual({
      inPlayCount: 1,
      toPlayCount: 1,
      projectedTotal: 21.1 + 5.4 + 8.8,
    });
  });

  it("excludes bye-week starters from in-play/to-play counts", () => {
    const players = [
      buildPlayer({ lineupSlot: "QB", game: null, projectedFantasyPoints: 0 }),
    ];

    expect(summarizeTeamPlay(players, NOW)).toEqual({
      inPlayCount: 0,
      toPlayCount: 0,
      projectedTotal: 0,
    });
  });
});

describe("buildMatchupComparisonRows", () => {
  it("pairs starters by lineup slot and roster order", () => {
    const home = [
      buildPlayer({
        playerId: "home-qb",
        lineupSlot: "QB",
        rosterOrder: 0,
      }),
      buildPlayer({
        playerId: "home-rb-1",
        lineupSlot: "RB",
        rosterOrder: 0,
      }),
      buildPlayer({
        playerId: "home-rb-2",
        lineupSlot: "RB",
        rosterOrder: 1,
      }),
    ];
    const away = [
      buildPlayer({
        playerId: "away-qb",
        lineupSlot: "QB",
        rosterOrder: 0,
      }),
      buildPlayer({
        playerId: "away-rb-1",
        lineupSlot: "RB",
        rosterOrder: 0,
      }),
    ];

    const { starters } = buildMatchupComparisonRows(home, away);
    const qbRow = starters.find((row) => row.slotLabel === "QB");
    const rbRows = starters.filter((row) => row.slotLabel === "RB");

    expect(qbRow?.home?.playerId).toBe("home-qb");
    expect(qbRow?.away?.playerId).toBe("away-qb");
    expect(rbRows).toHaveLength(2);
    expect(rbRows[0].home?.playerId).toBe("home-rb-1");
    expect(rbRows[0].away?.playerId).toBe("away-rb-1");
    // Uneven counts leave a blank cell rather than dropping the player.
    expect(rbRows[1].home?.playerId).toBe("home-rb-2");
    expect(rbRows[1].away).toBeNull();
  });

  it("pairs bench and IR by roster order only, independent of position", () => {
    const home = [
      buildPlayer({ playerId: "home-be-1", lineupSlot: "BE", rosterOrder: 0 }),
      buildPlayer({ playerId: "home-ir-1", lineupSlot: "IR", rosterOrder: 0 }),
    ];
    const away = [
      buildPlayer({ playerId: "away-be-1", lineupSlot: "BE", rosterOrder: 0 }),
    ];

    const { bench, injuredReserve } = buildMatchupComparisonRows(
      home,
      away,
    );

    expect(bench).toHaveLength(1);
    expect(bench[0].home?.playerId).toBe("home-be-1");
    expect(bench[0].away?.playerId).toBe("away-be-1");
    expect(injuredReserve).toHaveLength(1);
    expect(injuredReserve[0].home?.playerId).toBe("home-ir-1");
    expect(injuredReserve[0].away).toBeNull();
  });
});
