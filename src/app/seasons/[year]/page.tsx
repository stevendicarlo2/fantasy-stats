import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import type { WeeklyTeamResult } from "@/application/ports/database-provider";
import type { SeasonMatchupResult } from "@/application/services/season-stats-service";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import { SeasonAnalyticsDashboard } from "./season-analytics-dashboard";

interface SeasonPageProps {
  params: Promise<{ year: string }>;
}

function formatPoints(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}

function franchiseLabel(result: WeeklyTeamResult) {
  return result.displayName ?? result.ownerName ?? "Unknown person";
}

async function loadSeason(yearValue: string) {
  const year = Number(yearValue);

  if (!Number.isInteger(year)) {
    return { status: "missing" as const };
  }

  try {
    const runtime = await getWebRuntime();
    const stats = await runtime.seasonStatsService.getSeasonStats(year);

    if (!stats) {
      return { status: "missing" as const };
    }

    return { status: "ready" as const, stats };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The season data could not be loaded.",
    };
  }
}

export default async function SeasonPage({ params }: SeasonPageProps) {
  await connection();
  const { year } = await params;
  const pageData = await loadSeason(year);

  if (pageData.status === "missing") {
    notFound();
  }

  if (pageData.status === "error") {
    return (
      <main className="shell season-shell">
        <Link className="back-link" href="/">
          &larr; Season imports
        </Link>
        <section className="hero">
          <p className="eyebrow">Fantasy Stats</p>
          <h1>Season unavailable</h1>
          <p className="summary">{pageData.message}</p>
        </section>
      </main>
    );
  }

  const { stats } = pageData;
  const matchupsByWeek = new Map<number, SeasonMatchupResult[]>();

  for (const matchup of stats.matchups) {
    const weekMatchups = matchupsByWeek.get(matchup.week) ?? [];
    weekMatchups.push(matchup);
    matchupsByWeek.set(matchup.week, weekMatchups);
  }

  return (
    <main className="shell season-shell">
      <Link className="back-link" href="/">
        &larr; Season imports
      </Link>

      <header className="hero compact season-hero">
        <div>
          <p className="eyebrow">Imported season</p>
          <h1>{stats.year}</h1>
          <p className="summary">
            {stats.teamCount} teams &middot; regular season weeks{" "}
            {stats.regularSeasonStartWeek}-{stats.regularSeasonEndWeek}
          </p>
        </div>
        <Link
          className="page-action"
          href={`/seasons/${stats.year}/adjustments`}
        >
          Manage score adjustments
        </Link>
      </header>

      <SeasonAnalyticsDashboard
        records={stats.analytics}
        regularSeasonStartWeek={stats.regularSeasonStartWeek}
        regularSeasonEndWeek={stats.regularSeasonEndWeek}
      />

      <section className="weekly-section">
        <div>
          <p className="panel-kicker">Scoring detail</p>
          <h2>Weekly results</h2>
        </div>
        {[...matchupsByWeek.entries()].map(([week, matchups]) => (
          <details className="week-panel" key={week}>
            <summary>
              <span>Week {week}</span>
            </summary>
            <div className="matchup-list">
              {matchups.map((matchup) => {
                const results = matchup.away
                  ? [matchup.home, matchup.away]
                  : [matchup.home];

                return (
                    <article className="matchup-card" key={matchup.id}>
                      <header>
                        <strong>
                          {franchiseLabel(matchup.home)} vs.{" "}
                          {matchup.away
                            ? franchiseLabel(matchup.away)
                            : "Bye"}
                        </strong>
                        <span className={`phase ${matchup.phase}`}>
                          {matchup.phase}
                        </span>
                      </header>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Side</th>
                              <th>Franchise</th>
                              <th>Score</th>
                              <th>Adjustment</th>
                              <th>NP</th>
                              <th>H2H bonus</th>
                              <th>ANP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {results.map((result) => (
                              <tr key={result.franchiseId}>
                                <td>{result.matchupSide}</td>
                                <td>{franchiseLabel(result)}</td>
                                <td>
                                  {formatPoints(result.effectiveScore)}
                                </td>
                                <td>
                                  {formatPoints(result.scoreAdjustment)}
                                </td>
                                <td>
                                  {formatPoints(result.nascarPoints)}
                                </td>
                                <td>
                                  {formatPoints(result.headToHeadBonus)}
                                </td>
                                <td>
                                  {formatPoints(
                                    result.adjustedNascarPoints,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </article>
                  );
              })}
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
