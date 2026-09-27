import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import type { MatchupRosterDetail } from "@/domain/types";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import { buildMatchupComparisonRows } from "./matchup-presentation";
import { MatchupComparisonPanel } from "./matchup-comparison-panel";
import { DataSyncIndicator } from "../../../../data-sync-indicator";

interface MatchupRosterPageProps {
  params: Promise<{ year: string; matchupId: string }>;
  searchParams: Promise<{ period?: string }>;
}

async function loadMatchup(
  year: number,
  matchupId: string,
): Promise<
  | {
      status: "ready";
      matchup: MatchupRosterDetail | null;
      sync: Awaited<
        ReturnType<
          Awaited<ReturnType<typeof getWebRuntime>>[
            "dataSyncCoordinator"
          ]["observeView"]
        >
      >;
    }
  | { status: "error"; message: string }
> {
  try {
    const runtime = await getWebRuntime();
    const result = await runtime.seasonDataQueryService.getMatchupPage(
      year,
      matchupId,
    );
    return {
      status: "ready",
      matchup: result.data,
      sync: result.sync,
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
      <DataSyncIndicator
        key={`${pageData.sync.revision}:${pageData.sync.isSyncing}`}
        initialState={pageData.sync}
        seasonYear={year}
        view="matchup"
      />

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
        <MatchupComparisonPanel
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          comparisonRows={comparisonRows}
          nowIso={now.toISOString()}
        />
      )}
    </main>
  );
}
