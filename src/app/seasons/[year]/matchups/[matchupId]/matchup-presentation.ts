import type {
  LineupSlot,
  MatchupRosterPlayer,
  MatchupRosterPlayerGame,
  PlayerBoxScoreStats,
  PlayerPosition,
} from "@/domain/types";

export type GameState = "scheduled" | "in_progress" | "final" | "bye";

const easternKickoffFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function describeGameState(
  game: MatchupRosterPlayerGame | null,
  now: Date,
): GameState {
  if (!game) {
    return "bye";
  }

  if (game.completed) {
    return "final";
  }

  return new Date(game.startsAt) > now ? "scheduled" : "in_progress";
}

export function formatKickoffEastern(startsAt: string): string {
  return `${easternKickoffFormatter.format(new Date(startsAt))} ET`;
}

/**
 * Builds the opponent/status line shown under a player's name, e.g.
 * "@IND, Sun 1:25 PM ET", "@IND · In Progress", "vs IND Final", or "BYE".
 */
export function formatGameStatusLine(
  game: MatchupRosterPlayerGame | null,
  state: GameState,
): string {
  if (!game || state === "bye") {
    return "BYE";
  }

  const opponent = game.isHomeGame
    ? `vs ${game.opponentAbbreviation}`
    : `@${game.opponentAbbreviation}`;

  switch (state) {
    case "scheduled":
      return `${opponent}, ${formatKickoffEastern(game.startsAt)}`;
    case "in_progress":
      return `${opponent} · In Progress`;
    case "final":
      return `${opponent} Final`;
  }
}

function pluralizeStat(value: number, label: string): string {
  return `${value} ${label}`;
}

/**
 * Builds the compact box-score line shown under a player's game status,
 * e.g. "205 YDS, 3 PASS TD, 1 INT" for a QB or "5 REC, 63 YDS" for a WR.
 * Returns null when there is nothing meaningful to show (no stats yet, or
 * a position we don't summarize, such as D/ST).
 */
export function formatStatLine(
  position: PlayerPosition | null,
  stats: PlayerBoxScoreStats | null,
): string | null {
  if (!stats || !position) {
    return null;
  }

  const parts: string[] = [];

  switch (position) {
    case "QB": {
      parts.push(pluralizeStat(stats.passingYards, "YDS"));

      if (stats.passingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.passingTouchdowns, "PASS TD"));
      }

      if (stats.passingInterceptions > 0) {
        parts.push(pluralizeStat(stats.passingInterceptions, "INT"));
      }

      if (stats.rushingYards !== 0 || stats.rushingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.rushingYards, "RUSH YDS"));

        if (stats.rushingTouchdowns > 0) {
          parts.push(pluralizeStat(stats.rushingTouchdowns, "RUSH TD"));
        }
      }

      break;
    }
    case "RB": {
      parts.push(pluralizeStat(stats.rushingYards, "YDS"));

      if (stats.rushingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.rushingTouchdowns, "RUSH TD"));
      }

      if (stats.receptions > 0) {
        parts.push(pluralizeStat(stats.receptions, "REC"));
        parts.push(pluralizeStat(stats.receivingYards, "REC YDS"));
      }

      if (stats.receivingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.receivingTouchdowns, "REC TD"));
      }

      break;
    }
    case "WR":
    case "TE": {
      parts.push(pluralizeStat(stats.receptions, "REC"));
      parts.push(pluralizeStat(stats.receivingYards, "YDS"));

      if (stats.receivingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.receivingTouchdowns, "REC TD"));
      }

      if (stats.rushingYards !== 0 || stats.rushingTouchdowns > 0) {
        parts.push(pluralizeStat(stats.rushingYards, "RUSH YDS"));

        if (stats.rushingTouchdowns > 0) {
          parts.push(pluralizeStat(stats.rushingTouchdowns, "RUSH TD"));
        }
      }

      break;
    }
    case "K": {
      const fieldGoalsMade = stats.madeFieldGoalDistances.length;
      const fieldGoalsAttempted =
        fieldGoalsMade + stats.missedFieldGoalDistances.length;
      const extraPointsAttempted =
        stats.extraPointsMade + stats.extraPointsMissed;

      parts.push(`${fieldGoalsMade}/${fieldGoalsAttempted} FG`);
      parts.push(`${stats.extraPointsMade}/${extraPointsAttempted} XP`);
      break;
    }
    case "DST": {
      // No defensive box-score data is currently imported.
      return null;
    }
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

export interface TeamPlaySummary {
  inPlayCount: number;
  toPlayCount: number;
  projectedTotal: number;
}

const STARTER_SLOTS: MatchupRosterPlayer["lineupSlot"][] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "OP",
  "DST",
  "K",
];

/**
 * Summarizes a team's starting lineup for the header stat row: how many
 * starters are currently mid-game, how many haven't kicked off yet, and
 * the team's running projected total (actual points once final/in
 * progress, otherwise projected points).
 */
export function summarizeTeamPlay(
  players: MatchupRosterPlayer[],
  now: Date,
): TeamPlaySummary {
  const starters = players.filter((player) =>
    STARTER_SLOTS.includes(player.lineupSlot),
  );

  let inPlayCount = 0;
  let toPlayCount = 0;
  let projectedTotal = 0;

  for (const player of starters) {
    const state = describeGameState(player.game, now);

    if (state === "in_progress") {
      inPlayCount += 1;
    } else if (state === "scheduled") {
      toPlayCount += 1;
    }

    projectedTotal +=
      state === "final" || state === "in_progress"
        ? player.actualFantasyPoints
        : (player.projectedFantasyPoints ?? 0);
  }

  return { inPlayCount, toPlayCount, projectedTotal };
}

export interface MatchupComparisonRow {
  slotLabel: LineupSlot;
  home: MatchupRosterPlayer | null;
  away: MatchupRosterPlayer | null;
}

export interface MatchupComparisonRows {
  starters: MatchupComparisonRow[];
  bench: MatchupComparisonRow[];
  injuredReserve: MatchupComparisonRow[];
}

function bySlot(
  players: MatchupRosterPlayer[],
  slot: LineupSlot,
): MatchupRosterPlayer[] {
  return players
    .filter((player) => player.lineupSlot === slot)
    .sort((a, b) => a.rosterOrder - b.rosterOrder);
}

function zipRows(
  slotLabel: LineupSlot,
  home: MatchupRosterPlayer[],
  away: MatchupRosterPlayer[],
): MatchupComparisonRow[] {
  const rowCount = Math.max(home.length, away.length);

  return Array.from({ length: rowCount }, (_unused, index) => ({
    slotLabel,
    home: home[index] ?? null,
    away: away[index] ?? null,
  }));
}

/**
 * Pairs each team's roster into home-vs-away rows for the side-by-side
 * box score. Starters are paired by lineup slot (e.g. RB #1 vs RB #1);
 * bench and IR have no inherent position match, so they're paired by
 * roster order only. Uneven counts between the two teams leave a blank
 * cell on the shorter side rather than dropping any players.
 */
export function buildMatchupComparisonRows(
  homePlayers: MatchupRosterPlayer[],
  awayPlayers: MatchupRosterPlayer[],
): MatchupComparisonRows {
  const starters = STARTER_SLOTS.flatMap((slot) =>
    zipRows(slot, bySlot(homePlayers, slot), bySlot(awayPlayers, slot)),
  );
  const bench = zipRows(
    "BE",
    bySlot(homePlayers, "BE"),
    bySlot(awayPlayers, "BE"),
  );
  const injuredReserve = zipRows(
    "IR",
    bySlot(homePlayers, "IR"),
    bySlot(awayPlayers, "IR"),
  );

  return { starters, bench, injuredReserve };
}
