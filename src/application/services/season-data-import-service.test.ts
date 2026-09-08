import { describe, expect, it, vi } from "vitest";

import { SeasonDataImportService } from "./season-data-import-service";

function run(dataset: "core" | "rosters" | "transactions" | "player_stats") {
  return {
    id: `${dataset}-0000-4000-8000-000000000000`,
    provider: "espn",
    operation: "refresh" as const,
    dataset,
    seasonYear: 2025,
    status: "succeeded" as const,
    startedAt: "2026-09-07T12:00:00.000Z",
    completedAt: "2026-09-07T12:01:00.000Z",
    errorMessage: null,
  };
}

describe("SeasonDataImportService", () => {
  it("syncs supplemental datasets using the selected core operation", async () => {
    const core = {
      importSeason: vi.fn(),
      refreshSeason: vi.fn(),
      syncSeason: vi.fn().mockResolvedValue(run("core")),
    };
    const supplemental = {
      importRosters: vi.fn().mockResolvedValue(run("rosters")),
      importTransactions: vi.fn().mockResolvedValue(run("transactions")),
      importPlayerStats: vi.fn().mockResolvedValue(run("player_stats")),
    };
    const service = new SeasonDataImportService(core, supplemental);

    await service.syncSeason(2025);

    expect(core.syncSeason).toHaveBeenCalledWith(2025);
    expect(supplemental.importRosters).toHaveBeenCalledWith(2025, "refresh");
    expect(supplemental.importTransactions).toHaveBeenCalledWith(
      2025,
      "refresh",
    );
    expect(supplemental.importPlayerStats).toHaveBeenCalledWith(
      2025,
      "refresh",
    );
  });

  it("syncs one selected dataset with the requested operation", async () => {
    const core = {
      importSeason: vi.fn(),
      refreshSeason: vi.fn(),
      syncSeason: vi.fn(),
    };
    const supplemental = {
      importRosters: vi.fn().mockResolvedValue(run("rosters")),
      importTransactions: vi.fn(),
      importPlayerStats: vi.fn(),
    };
    const service = new SeasonDataImportService(core, supplemental);

    await expect(
      service.syncDataset(2025, "rosters", "refresh"),
    ).resolves.toEqual(run("rosters"));
    expect(supplemental.importRosters).toHaveBeenCalledWith(2025, "refresh");
    expect(core.importSeason).not.toHaveBeenCalled();
    expect(core.refreshSeason).not.toHaveBeenCalled();
  });

  it("keeps supplemental failures independent and still runs player stats", async () => {
    const core = {
      importSeason: vi.fn(),
      refreshSeason: vi.fn().mockResolvedValue(run("core")),
      syncSeason: vi.fn(),
    };
    const supplemental = {
      importRosters: vi.fn().mockRejectedValue(new Error("rosters failed")),
      importTransactions: vi
        .fn()
        .mockResolvedValue(run("transactions")),
      importPlayerStats: vi.fn().mockResolvedValue(run("player_stats")),
    };
    const service = new SeasonDataImportService(core, supplemental);

    const result = await service.refreshSeason(2025);

    expect(result.core).toEqual(run("core"));
    expect(result.rosters.status).toBe("rejected");
    expect(result.transactions).toEqual({
      status: "fulfilled",
      value: run("transactions"),
    });
    expect(result.playerStats).toEqual({
      status: "fulfilled",
      value: run("player_stats"),
    });
    expect(supplemental.importPlayerStats).toHaveBeenCalledWith(
      2025,
      "refresh",
    );
    expect(
      supplemental.importRosters.mock.invocationCallOrder[0],
    ).toBeLessThan(
      supplemental.importTransactions.mock.invocationCallOrder[0],
    );
    expect(
      supplemental.importTransactions.mock.invocationCallOrder[0],
    ).toBeLessThan(
      supplemental.importPlayerStats.mock.invocationCallOrder[0],
    );
  });

  it("does not run supplemental imports when core fails", async () => {
    const coreError = new Error("core failed");
    const core = {
      importSeason: vi.fn(),
      refreshSeason: vi.fn().mockRejectedValue(coreError),
      syncSeason: vi.fn(),
    };
    const supplemental = {
      importRosters: vi.fn(),
      importTransactions: vi.fn(),
      importPlayerStats: vi.fn(),
    };
    const service = new SeasonDataImportService(core, supplemental);

    await expect(service.refreshSeason(2025)).rejects.toBe(coreError);
    expect(supplemental.importRosters).not.toHaveBeenCalled();
    expect(supplemental.importTransactions).not.toHaveBeenCalled();
    expect(supplemental.importPlayerStats).not.toHaveBeenCalled();
  });
});
