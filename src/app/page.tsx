import { connection } from "next/server";
import Link from "next/link";

import { SafeOperationalError } from "@/application/errors";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import { ImportForm } from "./import-form";
import { DatasetRetryForm } from "./dataset-retry-form";

const importDatasets = [
  ["core", "Core"],
  ["rosters", "Rosters"],
  ["transactions", "Transactions"],
  ["player_stats", "Player stats"],
] as const;

async function loadPageData() {
  try {
    const runtime = await getWebRuntime();
    const dashboard = await runtime.dashboardService.getDashboard(
      runtime.earliestSeason,
      runtime.latestSeason,
    );

    return { ok: true as const, runtime, dashboard };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The application could not initialize its server runtime.",
    };
  }
}

export default async function Home() {
  await connection();
  const pageData = await loadPageData();

  if (!pageData.ok) {
    return (
      <main className="shell">
        <section className="hero">
          <p className="eyebrow">Fantasy Stats</p>
          <h1>Storage setup required</h1>
          <p className="summary">{pageData.message}</p>
          <div className="setup-card">
            <code>FANTASY_STATS_STORAGE=local</code>
            <p>
              Restart the development server after updating{" "}
              <code>.env.local</code>.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const { runtime, dashboard } = pageData;

  return (
    <main className="shell">
        <header className="hero compact">
          <div>
            <p className="eyebrow">Fantasy Stats</p>
            <h1>Season data</h1>
            <p className="summary">
              Sync canonical ESPN history and monitor persisted audit results.
            </p>
          </div>
          <div className="hero-actions">
            <Link className="page-action" href="/sql">
              Open SQL console
            </Link>
            <div className="storage-badge">
              <span>Storage</span>
              <strong>{runtime.storage.kind}</strong>
            </div>
          </div>
        </header>

        <section className="dashboard-grid">
          <article className="panel">
            <p className="panel-kicker">Data management</p>
            <h2>Sync a season</h2>
            <p>
              New seasons are imported automatically. Existing seasons are
              refreshed while preserving manual score adjustments and any
              prior supplemental snapshot whose refresh fails.
            </p>
            <ImportForm
              years={dashboard.availableYears}
              importedYears={dashboard.importedSeasons.map(
                (season) => season.year,
              )}
            />
          </article>

          <article className="panel">
            <p className="panel-kicker">Stored history</p>
            <h2>{dashboard.importedSeasons.length} seasons imported</h2>
            {dashboard.importedSeasons.length === 0 ? (
              <p>No seasons are stored yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Season</th>
                      <th>Teams</th>
                      <th>Supplemental datasets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.importedSeasons.map((season) => (
                      <tr key={season.year}>
                        <td>
                          <Link href={`/seasons/${season.year}`}>
                            {season.year}
                          </Link>
                        </td>
                        <td>{season.teamCount}</td>
                        <td>
                          <div className="dataset-status-list">
                            {importDatasets.map(([dataset, label]) => {
                              const status = season.datasetStatuses.find(
                                (candidate) =>
                                  candidate.dataset === dataset,
                              ) ?? {
                                dataset,
                                status: "not_imported" as const,
                                completedAt: null,
                                message: null,
                              };

                              return (
                                <div className="dataset-status" key={dataset}>
                                  <span>
                                    {label}:{" "}
                                    <strong className={`status ${status.status}`}>
                                      {status.status.replace("_", " ")}
                                    </strong>
                                  </span>
                                  {dataset !== "core" &&
                                  (status.status === "failed" ||
                                    status.status === "not_imported") ? (
                                    <DatasetRetryForm
                                      dataset={dataset}
                                      year={season.year}
                                    />
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>

        <section className="panel audit-panel">
          <p className="panel-kicker">Audit history</p>
          <h2>Recent import runs</h2>
          {dashboard.recentRuns.length === 0 ? (
            <p>No import attempts have been recorded.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Operation</th>
                    <th>Dataset</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{run.seasonYear}</td>
                      <td>{run.operation}</td>
                      <td>{run.dataset ?? "core"}</td>
                      <td>
                        <span className={`status ${run.status}`}>
                          {run.status}
                        </span>
                      </td>
                      <td>{new Date(run.startedAt).toLocaleString()}</td>
                      <td>{run.errorMessage ?? "Completed without error"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
  );
}
