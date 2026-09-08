import { describe, expect, it, vi } from "vitest";

import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { SeasonImportSnapshot } from "@/domain/types";

import { ImportDashboardService } from "./import-dashboard-service";

function createSnapshot(year: number): SeasonImportSnapshot {
  return {
    league: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Dashboard League",
    },
    season: {
      id: "10000000-0000-4000-8000-000000000002",
      leagueId: "10000000-0000-4000-8000-000000000001",
      year,
      teamCount: 2,
      playoffTeamCount: 1,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 1,
    },
    franchises: [],
    franchiseNames: [],
    seasonFranchiseNames: [],
    matchups: [],
    scores: [],
    sourceMappings: [],
  };
}

describe("ImportDashboardService", () => {
  it("summarizes imported seasons and recent runs", async () => {
    const database = {
      getSeasonImportSnapshot: vi.fn(async (year: number) =>
        year === 2024 ? createSnapshot(year) : null,
      ),
      listImportRuns: vi.fn().mockResolvedValue([
        {
          id: "10000000-0000-4000-8000-000000000003",
          provider: "espn",
          operation: "import",
          seasonYear: 2024,
          status: "succeeded",
          startedAt: "2026-08-23T22:00:00Z",
          completedAt: "2026-08-23T22:01:00Z",
          errorMessage: null,
        },
      ]),
      listSeasonDatasetStatuses: vi.fn().mockResolvedValue([]),
    } satisfies Pick<
      DatabaseProvider,
      | "getSeasonImportSnapshot"
      | "listImportRuns"
      | "listSeasonDatasetStatuses"
    >;
    const service = new ImportDashboardService(database);

    await expect(service.getDashboard(2023, 2025)).resolves.toEqual({
      availableYears: [2025, 2024, 2023],
      importedSeasons: [
        {
          year: 2024,
          teamCount: 2,
          datasetStatuses: [],
        },
      ],
      recentRuns: [expect.objectContaining({ seasonYear: 2024 })],
    });
    expect(database.listImportRuns).toHaveBeenCalledWith(10);
  });

  it("rejects an inverted season range", async () => {
    const service = new ImportDashboardService({
      getSeasonImportSnapshot: vi.fn(),
      listImportRuns: vi.fn(),
      listSeasonDatasetStatuses: vi.fn(),
    });

    await expect(service.getDashboard(2025, 2024)).rejects.toThrow(
      "Invalid dashboard season range",
    );
  });
});
