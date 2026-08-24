import { describe, expect, it, vi } from "vitest";

import { SafeOperationalError } from "@/application/errors";
import type { ImportRun } from "@/domain/types";

import { executeImportAction } from "./import-action-logic";

const importRun: ImportRun = {
  id: "10000000-0000-4000-8000-000000000001",
  provider: "espn",
  operation: "import",
  seasonYear: 2025,
  status: "succeeded",
  startedAt: "2026-08-23T22:00:00Z",
  completedAt: "2026-08-23T22:01:00Z",
  errorMessage: null,
};

describe("executeImportAction", () => {
  it("routes validated import and refresh requests", async () => {
    const importSeason = vi.fn().mockResolvedValue(importRun);
    const refreshSeason = vi.fn().mockResolvedValue({
      ...importRun,
      operation: "refresh",
    });
    const importForm = new FormData();
    importForm.set("operation", "import");
    importForm.set("year", "2025");

    await expect(
      executeImportAction(importForm, () => ({
        importSeason,
        refreshSeason,
      })),
    ).resolves.toEqual({
      status: "success",
      message: `Season 2025 import succeeded (run ${importRun.id})`,
    });
    expect(importSeason).toHaveBeenCalledWith(2025);

    const refreshForm = new FormData();
    refreshForm.set("operation", "refresh");
    refreshForm.set("year", "2025");
    await executeImportAction(refreshForm, () => ({
      importSeason,
      refreshSeason,
    }));
    expect(refreshSeason).toHaveBeenCalledWith(2025);
  });

  it("returns validation errors without creating a service", async () => {
    const getService = vi.fn();

    await expect(
      executeImportAction(new FormData(), getService),
    ).resolves.toEqual({
      status: "error",
      message: "Choose whether to import or refresh the season",
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
      })),
    ).resolves.toMatchObject({
      status: "error",
      message: "The season operation failed unexpectedly",
    });
  });
});
