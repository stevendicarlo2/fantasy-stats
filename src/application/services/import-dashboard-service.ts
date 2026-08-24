import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { ImportRun } from "@/domain/types";

export interface ImportedSeasonSummary {
  year: number;
  teamCount: number;
  matchupCount: number;
  scoreCount: number;
}

export interface ImportDashboard {
  availableYears: number[];
  importedSeasons: ImportedSeasonSummary[];
  recentRuns: ImportRun[];
}

type ImportDashboardDatabase = Pick<
  DatabaseProvider,
  "getSeasonImportSnapshot" | "listImportRuns"
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
          this.database.getSeasonImportSnapshot(year),
        ),
      ),
      this.database.listImportRuns(10),
    ]);
    const importedSeasons = snapshots.flatMap((snapshot) =>
      snapshot
        ? [
            {
              year: snapshot.season.year,
              teamCount: snapshot.season.teamCount,
              matchupCount: snapshot.matchups.length,
              scoreCount: snapshot.scores.length,
            },
          ]
        : [],
    );

    return { availableYears, importedSeasons, recentRuns };
  }
}
