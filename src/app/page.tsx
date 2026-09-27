import { connection } from "next/server";
import Link from "next/link";

import { SafeOperationalError } from "@/application/errors";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import { ImportForm } from "./import-form";
import { RelativeTime } from "./relative-time";
import {
  DatasetSyncButton,
  SeasonSyncControls,
} from "./season-sync-controls";

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

    return {
      ok: true as const,
      runtime,
      dashboard,
      renderedAt: Date.now(),
    };
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

  const { runtime, dashboard, renderedAt } = pageData;

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

        <section>
          <article className="panel season-history-panel">
            <p className="panel-kicker">Stored history</p>
            <div className="season-history-heading">
              <div>
                <h2>{dashboard.importedSeasons.length} seasons imported</h2>
                <p>
                  Open a season for analytics or refresh its persisted
                  datasets.
                </p>
              </div>
              <ImportForm
                key={dashboard.importedSeasons
                  .map((season) => season.year)
                  .join(",")}
                years={dashboard.availableYears}
                importedYears={dashboard.importedSeasons.map(
                  (season) => season.year,
                )}
              />
            </div>
            {dashboard.importedSeasons.length === 0 ? (
              <p>No seasons are stored yet.</p>
            ) : (
              <div className="season-history-list">
                {dashboard.importedSeasons.map((season) => (
                  <section className="season-history-item" key={season.year}>
                    <header className="season-history-item-heading">
                      <div>
                        <Link
                          className="season-history-link"
                          href={`/seasons/${season.year}`}
                        >
                          {season.year}
                        </Link>
                        <span>{season.teamCount} teams</span>
                      </div>
                      <SeasonSyncControls year={season.year} />
                    </header>
                    <div className="dataset-status-grid">
                      {importDatasets.map(([dataset, label]) => {
                        const status = season.datasetStatuses.find(
                          (candidate) => candidate.dataset === dataset,
                        ) ?? {
                          dataset,
                          activeRun: null,
                          lastSuccessfulStartedAt: null,
                          latestAttempt: null,
                          consecutiveFailureCount: 0,
                        };
                        const latestFailure =
                          status.latestAttempt &&
                          (status.latestAttempt.status === "failed" ||
                            status.latestAttempt.status === "unavailable") &&
                          (!status.lastSuccessfulStartedAt ||
                            status.latestAttempt.startedAt >
                              status.lastSuccessfulStartedAt)
                            ? status.latestAttempt
                            : null;

                        return (
                          <div className="dataset-status-card" key={dataset}>
                            <div className="dataset-status-card-heading">
                              <strong>{label}</strong>
                              <div>
                                {status.activeRun ? (
                                  <span className="status running">
                                    syncing
                                  </span>
                                ) : null}
                                <DatasetSyncButton
                                  dataset={dataset}
                                  label={label}
                                  year={season.year}
                                />
                              </div>
                            </div>
                            <span className="dataset-status-time">
                              {status.lastSuccessfulStartedAt ? (
                                <>
                                  Synced{" "}
                                  <RelativeTime
                                    initialNow={renderedAt}
                                    key={`${status.lastSuccessfulStartedAt}:${renderedAt}`}
                                    value={status.lastSuccessfulStartedAt}
                                  />
                                </>
                              ) : (
                                "Never synced"
                              )}
                            </span>
                            {latestFailure ? (
                              <span
                                className={`dataset-status-error ${latestFailure.status}`}
                              >
                                {latestFailure.errorMessage}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
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
                    <th>Trigger</th>
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
                      <td>{run.trigger ?? "legacy"}</td>
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
