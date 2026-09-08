import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { ImportRun } from "@/domain/types";
import type { SeasonDatasetStatus } from "@/domain/types";

export interface ImportedSeasonSummary {
  year: number;
  teamCount: number;
  datasetStatuses: SeasonDatasetStatus[];
}

export interface ImportDashboard {
  availableYears: number[];
  importedSeasons: ImportedSeasonSummary[];
  recentRuns: ImportRun[];
}

type ImportDashboardDatabase = Pick<
  DatabaseProvider,
  | "getSeasonImportSnapshot"
  | "listImportRuns"
  | "listSeasonDatasetStatuses"
>;

export class ImportDashboardService {
  constructor(private readonly database: ImportDashboardDatabase) {}

  async getDashboard(
    earliestSeason: number,
    latestSeason: number,
  ): Promise<ImportDashboard> {
    if (
      !Number.isInteger(earliestSeason) ||
      !Number.isInteger(latestSeason) ||
      earliestSeason > latestSeason
    ) {
      throw new Error("Invalid dashboard season range");
    }

    const availableYears = Array.from(
      { length: latestSeason - earliestSeason + 1 },
      (_, index) => latestSeason - index,
    );
    const [snapshots, recentRuns] = await Promise.all([
      Promise.all(
        availableYears.map((year) =>
          Promise.all([
            this.database.getSeasonImportSnapshot(year),
            this.database.listSeasonDatasetStatuses(year),
          ]),
        ),
      ),
      this.database.listImportRuns(10),
    ]);
    const importedSeasons = snapshots.flatMap(([snapshot, statuses]) =>
      snapshot
        ? [
            {
              year: snapshot.season.year,
              teamCount: snapshot.season.teamCount,
              datasetStatuses: statuses,
            },
          ]
        : [],
    );

    return { availableYears, importedSeasons, recentRuns };
  }
}
