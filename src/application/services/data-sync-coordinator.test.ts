import { describe, expect, it, vi } from "vitest";

import type { SeasonDatasetStatus } from "@/domain/types";

import { DataSyncCoordinator } from "./data-sync-coordinator";

const now = new Date("2026-09-27T20:00:00.000Z");

function status(
  overrides: Partial<SeasonDatasetStatus> = {},
): SeasonDatasetStatus {
  return {
    dataset: "core",
    activeRun: null,
    lastSuccessfulStartedAt: "2026-09-27T18:00:00.000Z",
    latestAttempt: {
      id: "10000000-0000-4000-8000-000000000001",
      trigger: "automatic",
      status: "succeeded",
      startedAt: "2026-09-27T18:00:00.000Z",
      completedAt: "2026-09-27T18:01:00.000Z",
      errorMessage: null,
    },
    consecutiveFailureCount: 0,
    ...overrides,
  };
}

function createHarness(
  overrides: {
    activeSeasonYear?: number | null;
    live?: boolean;
    statuses?: SeasonDatasetStatus[][];
    acquired?: boolean;
  } = {},
) {
  const runningRun = {
    id: "20000000-0000-4000-8000-000000000001",
    provider: "espn",
    operation: "refresh" as const,
    trigger: "automatic" as const,
    dataset: "core" as const,
    seasonYear: 2026,
    status: "running" as const,
    startedAt: now.toISOString(),
    completedAt: null,
    errorMessage: null,
  };
  const listSeasonDatasetStatuses = vi.fn();
  for (const result of overrides.statuses ?? [[status()]]) {
    listSeasonDatasetStatuses.mockResolvedValueOnce(result);
  }
  listSeasonDatasetStatuses.mockResolvedValue(
    overrides.statuses?.at(-1) ?? [status()],
  );
  const acquireImportRun = vi.fn().mockResolvedValue({
    acquired: overrides.acquired ?? true,
    run: runningRun,
  });
  const executeStartedRun = vi.fn(
    () => new Promise<never>(() => undefined),
  );
  const database = {
    acquireImportRun,
    getHighestActiveSeasonYear: vi
      .fn()
      .mockResolvedValue(overrides.activeSeasonYear ?? 2026),
    getImportRun: vi.fn().mockResolvedValue(runningRun),
    hasSeasonImport: vi.fn().mockResolvedValue(true),
    hasLiveNflGame: vi.fn().mockResolvedValue(overrides.live ?? false),
    listSeasonDatasetStatuses,
    renewImportLease: vi.fn().mockResolvedValue(true),
  };
  const importService = {
    executeStartedRun,
    prepareDataset: vi.fn(),
    providerForDataset: vi.fn().mockReturnValue("espn"),
  };
  const coordinator = new DataSyncCoordinator({
    database,
    importService,
    now: () => now,
    createId: vi
      .fn()
      .mockReturnValueOnce("30000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("40000000-0000-4000-8000-000000000001"),
  });

  return {
    acquireImportRun,
    coordinator,
    executeStartedRun,
  };
}

describe("DataSyncCoordinator", () => {
  it("does not automatically sync an inactive season", async () => {
    const harness = createHarness({ activeSeasonYear: 2025 });

    await expect(
      harness.coordinator.observeView(2026, "season"),
    ).resolves.toMatchObject({
      isSyncing: false,
      pollAfterMs: null,
    });
    expect(harness.acquireImportRun).not.toHaveBeenCalled();
  });

  it("starts stale requested data and returns syncing state", async () => {
    const harness = createHarness({
      statuses: [
        [status()],
        [
          status({
            activeRun: {
              id: "20000000-0000-4000-8000-000000000001",
              startedAt: now.toISOString(),
            },
            latestAttempt: {
              id: "20000000-0000-4000-8000-000000000001",
              trigger: "automatic",
              status: "running",
              startedAt: now.toISOString(),
              completedAt: null,
              errorMessage: null,
            },
          }),
        ],
      ],
    });

    await expect(
      harness.coordinator.observeView(2026, "season"),
    ).resolves.toMatchObject({
      isSyncing: true,
      pollAfterMs: 2_000,
    });
    expect(harness.acquireImportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "core",
        trigger: "automatic",
      }),
    );
    expect(harness.executeStartedRun).toHaveBeenCalled();
  });

  it("uses one-minute freshness and polling while a game is live", async () => {
    const recent = status({
      lastSuccessfulStartedAt: "2026-09-27T19:59:30.000Z",
    });
    const harness = createHarness({
      live: true,
      statuses: [[recent], [recent]],
    });

    await expect(
      harness.coordinator.observeView(2026, "season"),
    ).resolves.toMatchObject({
      isSyncing: false,
      pollAfterMs: 60_000,
    });
    expect(harness.acquireImportRun).not.toHaveBeenCalled();
  });

  it("backs off automatic retries after failure", async () => {
    const failed = status({
      latestAttempt: {
        id: "50000000-0000-4000-8000-000000000001",
        trigger: "automatic",
        status: "failed",
        startedAt: "2026-09-27T19:59:30.000Z",
        completedAt: "2026-09-27T19:59:40.000Z",
        errorMessage: "Synthetic failure",
      },
      consecutiveFailureCount: 1,
    });
    const harness = createHarness({
      statuses: [[failed], [failed]],
    });

    await expect(
      harness.coordinator.observeView(2026, "season"),
    ).resolves.toMatchObject({ pollAfterMs: 30_000 });

    expect(harness.acquireImportRun).not.toHaveBeenCalled();
  });

  it("does not reacquire work after observing an active lease", async () => {
    const active = status({
      activeRun: {
        id: "20000000-0000-4000-8000-000000000001",
        startedAt: now.toISOString(),
      },
      latestAttempt: {
        id: "20000000-0000-4000-8000-000000000001",
        trigger: "automatic",
        status: "running",
        startedAt: now.toISOString(),
        completedAt: null,
        errorMessage: null,
      },
    });
    const harness = createHarness({
      statuses: [[active], [active]],
    });

    await harness.coordinator.observeView(2026, "season");

    expect(harness.acquireImportRun).not.toHaveBeenCalled();
  });

  it("recovers a running audit whose lease is no longer active", async () => {
    const expired = status({
      activeRun: null,
      latestAttempt: {
        id: "20000000-0000-4000-8000-000000000001",
        trigger: "automatic",
        status: "running",
        startedAt: "2026-09-27T19:00:00.000Z",
        completedAt: null,
        errorMessage: null,
      },
    });
    const harness = createHarness({
      statuses: [[expired], [expired]],
    });

    await harness.coordinator.observeView(2026, "season");

    expect(harness.acquireImportRun).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: "core" }),
    );
  });

  it("joins an existing database-global run without executing twice", async () => {
    const harness = createHarness({ acquired: false });

    await expect(
      harness.coordinator.requestDataset({
        year: 2026,
        dataset: "core",
        operation: "refresh",
        trigger: "manual",
      }),
    ).resolves.toMatchObject({ started: false });
    expect(harness.executeStartedRun).not.toHaveBeenCalled();
  });
});
