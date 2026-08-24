import type {
  DatabaseProvider,
  SeasonStanding,
  WeeklyTeamResult,
} from "@/application/ports/database-provider";
import { SafeOperationalError } from "@/application/errors";

export interface SeasonMatchupResult {
  id: string;
  week: number;
  phase: WeeklyTeamResult["phase"];
  home: WeeklyTeamResult;
  away: WeeklyTeamResult | null;
}

export interface SeasonStats {
  year: number;
  teamCount: number;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
  standings: SeasonStanding[];
  matchups: SeasonMatchupResult[];
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
    const resultsByMatchup = new Map<string, WeeklyTeamResult[]>();

    for (const result of weeklyResults) {
      const matchupResults = resultsByMatchup.get(result.matchupId) ?? [];
      matchupResults.push(result);
      resultsByMatchup.set(result.matchupId, matchupResults);
    }

    const matchups = [...resultsByMatchup.entries()].map(
      ([matchupId, results]) => {
        const home = results.find(
          (result) => result.matchupSide === "home",
        );
        const away =
          results.find((result) => result.matchupSide === "away") ?? null;

        if (!home || results.length > 2) {
          throw new SafeOperationalError(
            `Matchup ${matchupId} has inconsistent team results`,
          );
        }

        return {
          id: matchupId,
          week: home.week,
          phase: home.phase,
          home,
          away,
        };
      },
    );

    return {
      year: snapshot.season.year,
      teamCount: snapshot.season.teamCount,
      regularSeasonStartWeek: snapshot.season.regularSeasonStartWeek,
      regularSeasonEndWeek: snapshot.season.regularSeasonEndWeek,
      standings,
      matchups,
    };
  }
}
