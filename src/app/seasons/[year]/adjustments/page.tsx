import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import type { WeeklyTeamResult } from "@/application/ports/database-provider";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import {
  AdjustmentManager,
  type AdjustmentCandidate,
  type AdjustmentMatchup,
  type ExistingAdjustment,
} from "../../../adjustment-manager";
import { SeasonYearSelector } from "../season-year-selector";

interface AdjustmentPageProps {
  params: Promise<{ year: string }>;
}

function franchiseLabel(result: WeeklyTeamResult) {
  return result.displayName ?? result.ownerName ?? "Unknown person";
}

async function loadAdjustmentPage(yearValue: string) {
  const year = Number(yearValue);

  if (!Number.isInteger(year)) {
    return { status: "missing" as const };
  }

  try {
    const runtime = await getWebRuntime();
    const [stats, adjustments, availableYears] = await Promise.all([
      runtime.seasonStatsService.getSeasonStats(year),
      runtime.matchupAdjustmentService.listSeasonAdjustments(year),
      runtime.seasonStatsService.getAvailableSeasonYears(),
    ]);

    if (!stats || !adjustments) {
      return { status: "missing" as const };
    }

    const adjustmentsByTarget = new Map(
      adjustments.map((adjustment) => [
        `${adjustment.matchupId}:${adjustment.franchiseId}`,
        adjustment,
      ]),
    );
    function createCandidate(
      result: WeeklyTeamResult,
    ): AdjustmentCandidate {
        const target = `${result.matchupId}:${result.franchiseId}`;
        const existingAdjustment = adjustmentsByTarget.get(target);

        return {
          franchiseId: result.franchiseId,
          teamLabel: franchiseLabel(result),
          importedScore:
            result.effectiveScore - result.scoreAdjustment,
          existingAdjustment:
            existingAdjustment?.scoreAdjustment ?? null,
        };
    }

    const matchups: AdjustmentMatchup[] = stats.matchups.map(
      (matchup) => ({
        id: matchup.id,
        week: matchup.week,
        label: `${franchiseLabel(matchup.home)} vs. ${
          matchup.away ? franchiseLabel(matchup.away) : "Bye"
        }`,
        home: createCandidate(matchup.home),
        away: matchup.away ? createCandidate(matchup.away) : null,
      }),
    );
    const resultsByTarget = new Map(
      stats.matchups.flatMap((matchup) =>
        [matchup.home, matchup.away]
          .filter(
            (
              result,
            ): result is NonNullable<typeof result> => result !== null,
          )
          .map((result) => [
            `${result.matchupId}:${result.franchiseId}`,
            { matchup, result },
          ] as const),
      ),
    );
    const existingAdjustments: ExistingAdjustment[] = adjustments.map(
      (adjustment) => {
        const target = resultsByTarget.get(
          `${adjustment.matchupId}:${adjustment.franchiseId}`,
        );

        return {
          id: adjustment.id,
          week: target?.matchup.week ?? 0,
          matchupLabel: target
            ? `${franchiseLabel(target.matchup.home)} vs. ${
                target.matchup.away
                  ? franchiseLabel(target.matchup.away)
                  : "Bye"
              }`
            : "Unknown matchup",
          teamLabel:
            target ? franchiseLabel(target.result) : "Unknown franchise",
          scoreAdjustment: adjustment.scoreAdjustment,
          reason: adjustment.reason,
        };
      },
    );

    return {
      status: "ready" as const,
      year,
      matchups,
      existingAdjustments,
      availableYears,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The matchup adjustments could not be loaded.",
    };
  }
}

export default async function AdjustmentPage({
  params,
}: AdjustmentPageProps) {
  await connection();
  const { year } = await params;
  const pageData = await loadAdjustmentPage(year);

  if (pageData.status === "missing") {
    notFound();
  }

  if (pageData.status === "error") {
    return (
      <main className="shell">
        <Link className="back-link" href={`/seasons/${year}`}>
          &larr; Season
        </Link>
        <section className="hero">
          <p className="eyebrow">Fantasy Stats</p>
          <h1>Adjustments unavailable</h1>
          <p className="summary">{pageData.message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <Link className="back-link" href={`/seasons/${pageData.year}`}>
        &larr; {pageData.year} season
      </Link>
      <header className="hero compact season-hero">
        <div>
          <p className="eyebrow">Manual corrections</p>
          <h1>{pageData.year} adjustments</h1>
          <p className="summary">
            Corrections remain separate from imported ESPN scores and
            immediately flow through effective scores, NP, and ANP.
          </p>
        </div>
        <div className="season-hero-actions">
          <SeasonYearSelector
            availableYears={pageData.availableYears}
            currentYear={pageData.year}
            pathSuffix="/adjustments"
          />
        </div>
      </header>
      <AdjustmentManager
        seasonYear={pageData.year}
        matchups={pageData.matchups}
        existingAdjustments={pageData.existingAdjustments}
      />
    </main>
  );
}
