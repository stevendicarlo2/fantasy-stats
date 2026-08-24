import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import type { WeeklyTeamResult } from "@/application/ports/database-provider";
import { getWebRuntime } from "@/server/runtime/web-runtime";

interface SeasonPageProps {
  params: Promise<{ year: string }>;
}

function formatPoints(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}

function teamLabel(result: WeeklyTeamResult) {
  return result.teamName ?? result.ownerName ?? "Unknown franchise";
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
      <main className="shell">
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
  const resultsByWeek = new Map<number, WeeklyTeamResult[]>();

  for (const result of stats.weeklyResults) {
    const weekResults = resultsByWeek.get(result.week) ?? [];
    weekResults.push(result);
    resultsByWeek.set(result.week, weekResults);
  }

  return (
    <main className="shell">
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

      <section className="panel">
        <p className="panel-kicker">Playoff qualification</p>
        <h2>Regular-season ANP standings</h2>
        <p>
          Rank is based only on cumulative regular-season Adjusted NASCAR
          Points. ESPN playoff seeds are not used.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Owner</th>
                <th>Weeks</th>
                <th>NP</th>
                <th>H2H bonus</th>
                <th>ANP</th>
              </tr>
            </thead>
            <tbody>
              {stats.standings.map((standing) => (
                <tr key={standing.franchiseId}>
                  <td>{standing.qualificationRank}</td>
                  <td>{standing.teamName ?? "Unknown team"}</td>
                  <td>{standing.ownerName ?? "--"}</td>
                  <td>{standing.weeksPlayed}</td>
                  <td>{formatPoints(standing.totalNascarPoints)}</td>
                  <td>{formatPoints(standing.totalHeadToHeadBonus)}</td>
                  <td>
                    <strong>
                      {formatPoints(standing.totalAdjustedNascarPoints)}
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="weekly-section">
        <div>
          <p className="panel-kicker">Scoring detail</p>
          <h2>Weekly results</h2>
        </div>
        {[...resultsByWeek.entries()].map(([week, results]) => (
          <details className="week-panel" key={week}>
            <summary>
              <span>Week {week}</span>
            </summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Team</th>
                    <th>Opponent</th>
                    <th>Score</th>
                    <th>Adjustment</th>
                    <th>NP</th>
                    <th>H2H bonus</th>
                    <th>ANP</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={`${result.matchupId}:${result.franchiseId}`}>
                      <td>
                        <span className={`phase ${result.phase}`}>
                          {result.phase}
                        </span>
                      </td>
                      <td>{teamLabel(result)}</td>
                      <td>{result.opponentTeamName ?? "Bye"}</td>
                      <td>{formatPoints(result.effectiveScore)}</td>
                      <td>{formatPoints(result.scoreAdjustment)}</td>
                      <td>{formatPoints(result.nascarPoints)}</td>
                      <td>{formatPoints(result.headToHeadBonus)}</td>
                      <td>{formatPoints(result.adjustedNascarPoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
