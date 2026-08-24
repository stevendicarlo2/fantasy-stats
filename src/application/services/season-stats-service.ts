import type {
  DatabaseProvider,
  SeasonStanding,
  WeeklyTeamResult,
} from "@/application/ports/database-provider";

export interface SeasonStats {
  year: number;
  teamCount: number;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
  standings: SeasonStanding[];
  weeklyResults: WeeklyTeamResult[];
}

type SeasonStatsDatabase = Pick<
  DatabaseProvider,
  | "getSeasonImportSnapshot"
  | "listSeasonStandings"
  | "listWeeklyTeamResults"
>;

export class SeasonStatsService {
  constructor(private readonly database: SeasonStatsDatabase) {}

  async getSeasonStats(seasonYear: number): Promise<SeasonStats | null> {
    if (!Number.isInteger(seasonYear)) {
      throw new Error("Season year must be an integer");
    }

    const snapshot =
      await this.database.getSeasonImportSnapshot(seasonYear);

    if (!snapshot) {
      return null;
    }

    const [standings, weeklyResults] = await Promise.all([
      this.database.listSeasonStandings(seasonYear),
      this.database.listWeeklyTeamResults(seasonYear),
    ]);

    return {
      year: snapshot.season.year,
      teamCount: snapshot.season.teamCount,
      regularSeasonStartWeek: snapshot.season.regularSeasonStartWeek,
      regularSeasonEndWeek: snapshot.season.regularSeasonEndWeek,
      standings,
      weeklyResults,
    };
  }
}
