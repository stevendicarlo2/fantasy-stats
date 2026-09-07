import { describe, expect, it, vi } from "vitest";

import { SafeOperationalError } from "@/application/errors";
import type { ImportRun } from "@/domain/types";

import { executeImportAction } from "./import-action-logic";

const importRun: ImportRun = {
  id: "10000000-0000-4000-8000-000000000001",
  provider: "espn",
  operation: "import",
  dataset: "core",
  seasonYear: 2025,
  status: "succeeded",
  startedAt: "2026-08-23T22:00:00Z",
  completedAt: "2026-08-23T22:01:00Z",
  errorMessage: null,
};

function fullResult() {
  return {
    core: importRun,
    rosters: {
      status: "fulfilled" as const,
      value: { ...importRun, dataset: "rosters" as const },
    },
    transactions: {
      status: "fulfilled" as const,
      value: { ...importRun, dataset: "transactions" as const },
    },
    playerStats: {
      status: "fulfilled" as const,
      value: { ...importRun, dataset: "player_stats" as const },
    },
  };
}

describe("executeImportAction", () => {
  it("routes validated import and refresh requests", async () => {
    const importSeason = vi.fn().mockResolvedValue(fullResult());
    const refreshSeason = vi.fn().mockResolvedValue({
      ...fullResult(),
      core: { ...importRun, operation: "refresh" },
    });
    const importForm = new FormData();
    importForm.set("operation", "import");
    importForm.set("year", "2025");

    await expect(
      executeImportAction(importForm, () => ({
        importSeason,
        refreshSeason,
        retryRosters: vi.fn(),
        retryTransactions: vi.fn(),
        retryPlayerStats: vi.fn(),
      })),
    ).resolves.toEqual({
      status: "success",
      message: "Season 2025 import succeeded",
    });
    expect(importSeason).toHaveBeenCalledWith(2025);

    const refreshForm = new FormData();
    refreshForm.set("operation", "refresh");
    refreshForm.set("year", "2025");
    await executeImportAction(refreshForm, () => ({
      importSeason,
      refreshSeason,
      retryRosters: vi.fn(),
      retryTransactions: vi.fn(),
      retryPlayerStats: vi.fn(),
    }));
    expect(refreshSeason).toHaveBeenCalledWith(2025);
  });

  it("returns validation errors without creating a service", async () => {
    const getService = vi.fn();

    await expect(
      executeImportAction(new FormData(), getService),
    ).resolves.toEqual({
      status: "error",
      message: "Choose a valid season data operation",
    });
    expect(getService).not.toHaveBeenCalled();
  });

  it("returns safe failures and hides unknown details", async () => {
    const formData = new FormData();
    formData.set("operation", "import");
    formData.set("year", "2025");

    await expect(
      executeImportAction(formData, () => ({
        importSeason: vi
          .fn()
          .mockRejectedValue(new SafeOperationalError("ESPN unavailable")),
        refreshSeason: vi.fn(),
        retryRosters: vi.fn(),
        retryTransactions: vi.fn(),
        retryPlayerStats: vi.fn(),
      })),
    ).resolves.toMatchObject({
      status: "error",
      message: "ESPN unavailable",
    });
    await expect(
      executeImportAction(formData, () => ({
        importSeason: vi
          .fn()
          .mockRejectedValue(new Error("private failure detail")),
        refreshSeason: vi.fn(),
        retryRosters: vi.fn(),
        retryTransactions: vi.fn(),
        retryPlayerStats: vi.fn(),
      })),
    ).resolves.toMatchObject({
      status: "error",
      message: "The season operation failed unexpectedly",
    });
  });

  it("reports partial supplemental failures without hiding core success", async () => {
      const formData = new FormData();
      formData.set("operation", "refresh");
      formData.set("year", "2025");
      const result = {
        ...fullResult(),
        rosters: {
          status: "rejected" as const,
          reason: new Error("roster failure"),
        },
      };

      await expect(
        executeImportAction(formData, () => ({
          importSeason: vi.fn(),
          refreshSeason: vi.fn().mockResolvedValue(result),
          retryRosters: vi.fn(),
          retryTransactions: vi.fn(),
          retryPlayerStats: vi.fn(),
        })),
      ).resolves.toEqual({
        status: "partial",
        message:
          "Season 2025 core data succeeded, but rosters failed. Existing supplemental data was preserved.",
    });
  });
});
