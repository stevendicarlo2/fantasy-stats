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

function rosterSection(
  title: string,
  players: MatchupRosterPlayer[],
) {
  if (players.length === 0) {
    return null;
  }

  return (
    <section className="roster-section">
      <h3>{title}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Player</th>
              <th>Actual</th>
              <th>Projected</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={`${player.playerId}-${player.lineupSlot}`}>
                <td>{player.lineupSlot}</td>
                <td>{player.displayName}</td>
                <td>{formatPoints(player.actualFantasyPoints)}</td>
                <td>{formatPoints(player.projectedFantasyPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
          {selectedPeriod && selectedPeriod.teams.length > 0 ? (
            <div className="matchup-scoreboard">
              {selectedPeriod.teams.map((team) => (
                <div key={team.franchiseId}>
                  <span>{teamLabel(team)}</span>
                  <strong>{formatPoints(team.effectiveScore)}</strong>
                </div>
              ))}
            </div>
          ) : null}
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

        {!selectedPeriod || selectedPeriod.teams.length === 0 ? (
          <section className="panel">
            <h2>Roster data unavailable</h2>
            <p>No weekly roster snapshot has been imported for this matchup.</p>
          </section>
        ) : (
          <section className="roster-grid">
            {selectedPeriod.teams.map((team) => {
              const starters = team.players.filter(
                (player) =>
                  player.lineupSlot !== "BE" &&
                  player.lineupSlot !== "IR",
              );
              const bench = team.players.filter(
                (player) => player.lineupSlot === "BE",
              );
              const injuredReserve = team.players.filter(
                (player) => player.lineupSlot === "IR",
              );

              return (
                <article className="panel roster-team" key={team.franchiseId}>
                  <header>
                    <div>
                      <p className="panel-kicker">{team.matchupSide}</p>
                      <h2>{teamLabel(team)}</h2>
                    </div>
                    <div className="roster-score">
                      <span>Team score</span>
                      <strong>{formatPoints(team.effectiveScore)}</strong>
                    </div>
                  </header>
                  {team.rosterState === "provisional" ? (
                    <p className="provisional-note">
                      This lineup is provisional and may change on refresh.
                    </p>
                  ) : null}
                  {rosterSection("Starters", starters)}
                  {rosterSection("Bench", bench)}
                  {rosterSection("Injured reserve", injuredReserve)}
                </article>
              );
            })}
          </section>
        )}
      </main>
  );
}
