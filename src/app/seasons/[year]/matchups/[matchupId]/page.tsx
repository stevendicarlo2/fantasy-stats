import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import type {
  MatchupRosterDetail,
  MatchupRosterPlayer,
  MatchupRosterTeam,
} from "@/domain/types";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import {
  buildMatchupComparisonRows,
  describeGameState,
  formatGameStatusLine,
  formatStatLine,
  summarizeTeamPlay,
  type MatchupComparisonRow,
} from "./matchup-presentation";

interface MatchupRosterPageProps {
  params: Promise<{ year: string; matchupId: string }>;
  searchParams: Promise<{ period?: string }>;
}

function formatPoints(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}

function teamLabel(team: MatchupRosterTeam) {
  return team.franchiseName ?? team.ownerName ?? "Unknown franchise";
}

function playerPoints(
  player: MatchupRosterPlayer | null,
  now: Date,
): number | null {
  if (!player) {
    return null;
  }

  const state = describeGameState(player.game, now);
  return state === "scheduled" || state === "bye"
    ? null
    : player.actualFantasyPoints;
}

function playerCell(player: MatchupRosterPlayer | null, now: Date) {
  if (!player) {
    return <span className="player-cell-empty">--</span>;
  }

  const state = describeGameState(player.game, now);
  const statusLine = formatGameStatusLine(player.game, state);
  const statLine = formatStatLine(
    player.position,
    player.game?.stats ?? null,
  );
  const isLive = state === "in_progress";

  return (
    <div className={`player-info${isLive ? " live" : " muted"}`}>
      <p className="player-name">
        {player.displayName}
        {player.nflTeamAbbreviation ? (
          <span className="player-team"> {player.nflTeamAbbreviation}</span>
        ) : null}
      </p>
      <p className="player-status">{statusLine}</p>
      {statLine ? <p className="player-stat-line">{statLine}</p> : null}
    </div>
  );
}

function comparisonSection(
  title: string,
  rows: MatchupComparisonRow[],
  now: Date,
  variant: "starters" | "reserve" = "starters",
) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className={`roster-section${variant === "reserve" ? " reserve" : ""}`}>
      <h3>{title}</h3>
      <div className="table-wrap">
        <table className="matchup-comparison-table">
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.slotLabel}-${index}`}>
                <td className="player-cell home">
                  {playerCell(row.home, now)}
                </td>
                <td className="points-cell home">
                  {formatPoints(playerPoints(row.home, now))}
                </td>
                <td className="position-cell">{row.slotLabel}</td>
                <td className="points-cell away">
                  {formatPoints(playerPoints(row.away, now))}
                </td>
                <td className="player-cell away">
                  {playerCell(row.away, now)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function teamSummaryHeader(
  team: MatchupRosterTeam | undefined,
  now: Date,
) {
  if (!team) {
    return null;
  }

  const summary = summarizeTeamPlay(team.players, now);

  return (
    <div className="matchup-team-header">
      <div>
        <p className="panel-kicker">{team.matchupSide}</p>
        <h2>{teamLabel(team)}</h2>
      </div>
      <div className="matchup-team-score">
        <strong>{formatPoints(team.effectiveScore)}</strong>
        <span>
          In Play: {summary.inPlayCount} To Play: {summary.toPlayCount}{" "}
          Proj Total: {summary.projectedTotal.toFixed(1)}
        </span>
      </div>
      {team.rosterState === "provisional" ? (
        <p className="provisional-note">
          This lineup is provisional and may change on refresh.
        </p>
      ) : null}
    </div>
  );
}

async function loadMatchup(
  year: number,
  matchupId: string,
): Promise<
  | { status: "ready"; matchup: MatchupRosterDetail | null }
  | { status: "error"; message: string }
> {
  try {
    const runtime = await getWebRuntime();
    return {
      status: "ready",
      matchup: await runtime.matchupRosterService.getMatchupRoster(
        year,
        matchupId,
      ),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The matchup roster could not be loaded.",
    };
  }
}

export default async function MatchupRosterPage({
  params,
  searchParams,
}: MatchupRosterPageProps) {
  await connection();
  const [{ year: yearValue, matchupId }, { period: periodValue }] =
    await Promise.all([params, searchParams]);
  const year = Number(yearValue);

  if (!Number.isInteger(year)) {
    notFound();
  }

  const pageData = await loadMatchup(year, matchupId);

  if (pageData.status === "error") {
    return (
      <main className="shell season-shell">
        <Link className="back-link" href={`/seasons/${year}`}>
          &larr; Season {year}
        </Link>
        <section className="panel">
          <h1>Roster data unavailable</h1>
          <p>{pageData.message}</p>
        </section>
      </main>
    );
  }

  if (!pageData.matchup) {
    notFound();
  }

  const matchup = pageData.matchup;
  const requestedPeriod = Number(periodValue);
  const selectedPeriod =
    matchup.periods.find(
      (period) => period.scoringPeriod === requestedPeriod,
    ) ?? matchup.periods[0];
  const homeTeam = selectedPeriod?.teams.find(
    (team) => team.matchupSide === "home",
  );
  const awayTeam = selectedPeriod?.teams.find(
    (team) => team.matchupSide === "away",
  );
  const now = new Date();
  const comparisonRows =
    homeTeam || awayTeam
      ? buildMatchupComparisonRows(
          homeTeam?.players ?? [],
          awayTeam?.players ?? [],
        )
      : null;

  return (
    <main className="shell season-shell">
      <Link className="back-link" href={`/seasons/${year}`}>
        &larr; Season {year}
      </Link>
      <header className="hero compact season-hero matchup-roster-hero">
        <div>
          <p className="eyebrow">Matchup rosters</p>
          <h1>
            {year} period {matchup.matchupPeriod}
          </h1>
          <p className="summary">
            Weekly lineup snapshots and fantasy points for this matchup.
          </p>
        </div>
        <span className={`phase ${matchup.phase}`}>{matchup.phase}</span>
      </header>

      {matchup.periods.length > 1 ? (
        <nav className="period-tabs" aria-label="Scoring period">
          {matchup.periods.map((period) => (
            <Link
              className={
                period.scoringPeriod === selectedPeriod?.scoringPeriod
                  ? "selected"
                  : undefined
              }
              href={`?period=${period.scoringPeriod}`}
              key={period.scoringPeriod}
            >
              Week {period.scoringPeriod}
            </Link>
          ))}
        </nav>
      ) : null}

      {!selectedPeriod || !comparisonRows ? (
        <section className="panel">
          <h2>Roster data unavailable</h2>
          <p>No weekly roster snapshot has been imported for this matchup.</p>
        </section>
      ) : (
        <section className="panel matchup-comparison">
          <div className="matchup-comparison-teams">
            {teamSummaryHeader(homeTeam, now)}
            {teamSummaryHeader(awayTeam, now)}
          </div>
          {comparisonSection("Starters", comparisonRows.starters, now)}
          {comparisonSection("Bench", comparisonRows.bench, now, "reserve")}
          {comparisonSection(
            "Injured reserve",
            comparisonRows.injuredReserve,
            now,
            "reserve",
          )}
        </section>
      )}
    </main>
  );
}
