import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import {
  AdjustmentManager,
  type AdjustmentCandidate,
  type ExistingAdjustment,
} from "../../../adjustment-manager";

interface AdjustmentPageProps {
  params: Promise<{ year: string }>;
}

async function loadAdjustmentPage(yearValue: string) {
  const year = Number(yearValue);

  if (!Number.isInteger(year)) {
    return { status: "missing" as const };
  }

  try {
    const runtime = await getWebRuntime();
    const [stats, adjustments] = await Promise.all([
      runtime.seasonStatsService.getSeasonStats(year),
      runtime.matchupAdjustmentService.listSeasonAdjustments(year),
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
    const candidates: AdjustmentCandidate[] = stats.weeklyResults.map(
      (result) => {
        const target = `${result.matchupId}:${result.franchiseId}`;
        const existingAdjustment = adjustmentsByTarget.get(target);

        return {
          matchupId: result.matchupId,
          franchiseId: result.franchiseId,
          week: result.week,
          teamLabel:
            result.teamName ?? result.ownerName ?? "Unknown franchise",
          opponentLabel: result.opponentTeamName ?? "Bye",
          importedScore:
            result.effectiveScore - result.scoreAdjustment,
          existingAdjustment:
            existingAdjustment?.scoreAdjustment ?? null,
        };
      },
    );
    const resultsByTarget = new Map(
      stats.weeklyResults.map((result) => [
        `${result.matchupId}:${result.franchiseId}`,
        result,
      ]),
    );
    const existingAdjustments: ExistingAdjustment[] = adjustments.map(
      (adjustment) => {
        const result = resultsByTarget.get(
          `${adjustment.matchupId}:${adjustment.franchiseId}`,
        );

        return {
          id: adjustment.id,
          week: result?.week ?? 0,
          teamLabel:
            result?.teamName ??
            result?.ownerName ??
            "Unknown franchise",
          scoreAdjustment: adjustment.scoreAdjustment,
          reason: adjustment.reason,
        };
      },
    );

    return {
      status: "ready" as const,
      year,
      candidates,
      existingAdjustments,
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
      </header>
      <AdjustmentManager
        seasonYear={pageData.year}
        candidates={pageData.candidates}
        existingAdjustments={pageData.existingAdjustments}
      />
    </main>
  );
}
