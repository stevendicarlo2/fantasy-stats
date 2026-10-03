import { randomUUID } from "node:crypto";

import type {
  DatabaseProvider,
} from "@/application/ports/database-provider";
import type {
  ImportDataset,
  ImportOperation,
  ImportRun,
  ImportTrigger,
  SeasonDatasetStatus,
} from "@/domain/types";

import type { SeasonDataImportService } from "./season-data-import-service";

const ACTIVE_POLL_MS = 2_000;
const LIVE_POLL_MS = 60_000;
const NORMAL_STALE_MS = 60 * 60_000;
const LIVE_STALE_MS = 60_000;
const LIVE_GAME_MAX_AGE_MS = 6 * 60 * 60_000;
const LEASE_DURATION_MS = 5 * 60_000;
const HEARTBEAT_MS = 60_000;
const FAILURE_BACKOFF_MS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000];

export type DataSyncView = "season" | "matchup" | "adjustments";

export interface DataSyncViewState {
  isSyncing: boolean;
  revision: string;
  pollAfterMs: number | null;
}

export interface DatasetSyncRequest {
  year: number;
  dataset: ImportDataset;
  operation?: ImportOperation;
  trigger: Exclude<ImportTrigger, "legacy">;
}

export interface DatasetSyncRequestResult {
  run: ImportRun;
  started: boolean;
}

type SyncDatabase = Pick<
  DatabaseProvider,
  | "acquireImportRun"
  | "getHighestActiveSeasonYear"
  | "getImportRun"
  | "hasSeasonImport"
  | "hasLiveNflGame"
  | "listSeasonDatasetStatuses"
  | "renewImportLease"
>;

type ImportService = Pick<
  SeasonDataImportService,
  | "executeStartedRun"
  | "prepareDataset"
  | "providerForDataset"
>;

export interface DataSyncCoordinatorOptions {
  database: SyncDatabase;
  importService: ImportService;
  isAutomaticSyncEnabled?: boolean;
  now?: () => Date;
  createId?: () => string;
  setIntervalImplementation?: typeof setInterval;
  clearIntervalImplementation?: typeof clearInterval;
  wait?: (milliseconds: number) => Promise<void>;
}

const viewDependencies: Record<DataSyncView, ImportDataset[]> = {
  season: ["core"],
  matchup: ["core", "rosters", "player_stats"],
  adjustments: ["core"],
};

function addMilliseconds(date: Date, milliseconds: number) {
  return new Date(date.getTime() + milliseconds);
}

function automaticBackoff(status: SeasonDatasetStatus) {
  if (
    status.latestAttempt?.status !== "failed" ||
    status.consecutiveFailureCount === 0
  ) {
    return 0;
  }

  return FAILURE_BACKOFF_MS[
    Math.min(
      status.consecutiveFailureCount - 1,
      FAILURE_BACKOFF_MS.length - 1,
    )
  ];
}

function isStale(
  status: SeasonDatasetStatus,
  now: Date,
  staleAfterMs: number,
) {
  if (!status.lastSuccessfulStartedAt) {
    return true;
  }

  return (
    now.getTime() -
      new Date(status.lastSuccessfulStartedAt).getTime() >=
    staleAfterMs
  );
}

function canRetryAutomatically(
  status: SeasonDatasetStatus,
  now: Date,
) {
  if (status.latestAttempt?.status === "unavailable") {
    return false;
  }

  const delay = automaticBackoff(status);
  if (delay === 0 || status.latestAttempt?.status !== "failed") {
    return true;
  }

  return (
    now.getTime() -
      new Date(status.latestAttempt.startedAt).getTime() >=
    delay
  );
}

function automaticRetryAfter(
  status: SeasonDatasetStatus,
  now: Date,
) {
  if (status.latestAttempt?.status !== "failed") {
    return null;
  }

  const delay = automaticBackoff(status);
  const elapsed =
    now.getTime() - new Date(status.latestAttempt.startedAt).getTime();
  return Math.max(0, delay - elapsed);
}

export class DataSyncCoordinator {
  private readonly isAutomaticSyncEnabled: boolean;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly setIntervalImplementation: typeof setInterval;
  private readonly clearIntervalImplementation: typeof clearInterval;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly executions = new Map<string, Promise<void>>();

  constructor(private readonly options: DataSyncCoordinatorOptions) {
    this.isAutomaticSyncEnabled =
      options.isAutomaticSyncEnabled ?? false;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.setIntervalImplementation =
      options.setIntervalImplementation ?? setInterval;
    this.clearIntervalImplementation =
      options.clearIntervalImplementation ?? clearInterval;
    this.wait =
      options.wait ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async requestDataset(
    request: DatasetSyncRequest,
  ): Promise<DatasetSyncRequestResult> {
    const operation =
      request.operation ??
      ((await this.options.database.hasSeasonImport(request.year))
        ? "refresh"
        : "import");
    await this.options.importService.prepareDataset(
      request.year,
      request.dataset,
      operation,
    );

    const now = this.now();
    const ownerToken = this.createId();
    const result = await this.options.database.acquireImportRun({
      id: this.createId(),
      provider: this.options.importService.providerForDataset(
        request.dataset,
      ),
      operation,
      trigger: request.trigger,
      dataset: request.dataset,
      seasonYear: request.year,
      startedAt: now.toISOString(),
      ownerToken,
      leaseExpiresAt: addMilliseconds(
        now,
        LEASE_DURATION_MS,
      ).toISOString(),
      abandonedAt: now.toISOString(),
    });

    if (result.acquired) {
      this.startExecution(result.run, ownerToken);
    }

    return { run: result.run, started: result.acquired };
  }

  async observeView(
    year: number,
    view: DataSyncView,
  ): Promise<DataSyncViewState> {
    if (!this.isAutomaticSyncEnabled) {
      return {
        isSyncing: false,
        revision: "",
        pollAfterMs: null,
      };
    }

    const now = this.now();
    const activeSeasonYear =
      await this.options.database.getHighestActiveSeasonYear();
    const isEligible = activeSeasonYear === year;
    const live = isEligible
      ? await this.options.database.hasLiveNflGame(
          year,
          addMilliseconds(now, -LIVE_GAME_MAX_AGE_MS).toISOString(),
          now.toISOString(),
        )
      : false;
    const requestedDatasets: readonly ImportDataset[] =
      view === "season" && live
        ? (["core", "rosters", "player_stats"] as const)
        : viewDependencies[view];
    let statuses =
      await this.options.database.listSeasonDatasetStatuses(year);

    if (isEligible) {
      await this.startNextAutomaticDataset(
        year,
        requestedDatasets,
        statuses,
        live,
        now,
      );
      statuses =
        await this.options.database.listSeasonDatasetStatuses(year);
    }

    const relevant = statuses.filter((status) =>
      requestedDatasets.includes(status.dataset),
    );
    const isSyncing = relevant.some((status) => status.activeRun !== null);
    const nextRetry = isEligible
      ? relevant
          .filter(
            (status) =>
              status.latestAttempt?.status === "failed" &&
              isStale(
                status,
                now,
                live && status.dataset !== "transactions"
                  ? LIVE_STALE_MS
                  : NORMAL_STALE_MS,
              ),
          )
          .map((status) => automaticRetryAfter(status, now))
          .filter((delay): delay is number => delay !== null && delay > 0)
          .sort((left, right) => left - right)[0]
      : undefined;

    return {
      isSyncing,
      revision: relevant
        .map(
          (status) =>
            `${status.dataset}:${status.lastSuccessfulStartedAt ?? "none"}`,
        )
        .join("|"),
      pollAfterMs: isSyncing
        ? ACTIVE_POLL_MS
        : live
          ? LIVE_POLL_MS
          : (nextRetry ?? null),
    };
  }

  getRun(importRunId: string) {
    return this.options.database.getImportRun(importRunId);
  }

  async runDatasetAndWait(
    request: DatasetSyncRequest,
  ): Promise<ImportRun> {
    while (true) {
      const result = await this.requestDataset(request);
      const localExecution = this.executions.get(result.run.id);

      if (localExecution) {
        await localExecution.catch(() => undefined);
      }

      const run = await this.options.database.getImportRun(result.run.id);
      if (run && run.status !== "running") {
        return run;
      }

      await this.wait(ACTIVE_POLL_MS);
    }
  }

  private async startNextAutomaticDataset(
    year: number,
    datasets: readonly ImportDataset[],
    statuses: SeasonDatasetStatus[],
    live: boolean,
    now: Date,
  ) {
    const byDataset = new Map(
      statuses.map((status) => [status.dataset, status]),
    );

    for (const dataset of datasets) {
      const status = byDataset.get(dataset);
      if (!status) {
        continue;
      }

      if (status.activeRun) {
        return;
      }

      const prerequisite =
        dataset === "rosters"
          ? byDataset.get("core")
          : dataset === "player_stats"
            ? byDataset.get("rosters")
            : null;
      if (
        prerequisite &&
        prerequisite.latestAttempt?.status !== "succeeded"
      ) {
        return;
      }

      const staleAfter =
        live && dataset !== "transactions"
          ? LIVE_STALE_MS
          : NORMAL_STALE_MS;
      if (
        !isStale(status, now, staleAfter) ||
        !canRetryAutomatically(status, now)
      ) {
        continue;
      }

      await this.requestDataset({
        year,
        dataset,
        trigger: "automatic",
      });
      return;
    }
  }

  private startExecution(run: ImportRun, ownerToken: string) {
    const heartbeat = this.setIntervalImplementation(() => {
      const now = this.now();
      void this.options.database.renewImportLease({
        importRunId: run.id,
        ownerToken,
        heartbeatAt: now.toISOString(),
        expiresAt: addMilliseconds(
          now,
          LEASE_DURATION_MS,
        ).toISOString(),
      });
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    const execution = this.options.importService
      .executeStartedRun(run)
      .then(() => undefined)
      .finally(() => {
        this.clearIntervalImplementation(heartbeat);
        this.executions.delete(run.id);
      });
    this.executions.set(run.id, execution);
    void execution.catch(() => undefined);
  }
}
