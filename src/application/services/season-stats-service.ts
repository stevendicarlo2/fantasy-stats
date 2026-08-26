import type {
  DatabaseProvider,
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

export interface AnalyticsMetricValues {
  score: number;
  np: number;
  anp: number;
}

export interface SeasonAnalyticsRecord {
  franchiseId: string;
  displayName: string;
  teamName: string;
  opponentFranchiseId: string;
  opponentDisplayName: string;
  opponentTeamName: string;
  week: number;
  team: AnalyticsMetricValues;
  opponent: AnalyticsMetricValues;
}

export interface SeasonStats {
  year: number;
  teamCount: number;
  playoffTeamCount: number | null;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
  matchups: SeasonMatchupResult[];
  analytics: SeasonAnalyticsRecord[];
}

type SeasonStatsDatabase = Pick<
  DatabaseProvider,
  | "getSeasonImportSnapshot"
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

    const weeklyResults =
      await this.database.listWeeklyTeamResults(seasonYear);
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
    const analytics = matchups.flatMap((matchup) => {
      if (matchup.phase !== "regular" || matchup.away === null) {
        return [];
      }

      const createRecord = (
        team: WeeklyTeamResult,
        opponent: WeeklyTeamResult,
      ): SeasonAnalyticsRecord => {
        if (
          team.adjustedNascarPoints === null ||
          team.headToHeadBonus === null ||
          opponent.adjustedNascarPoints === null ||
          opponent.headToHeadBonus === null
        ) {
          throw new SafeOperationalError(
            `Regular-season matchup ${matchup.id} is missing scoring results`,
          );
        }

        return {
          franchiseId: team.franchiseId,
          displayName:
            team.displayName ?? team.ownerName ?? "Unknown person",
          teamName: team.teamName ?? "Unknown team",
          opponentFranchiseId: opponent.franchiseId,
          opponentDisplayName:
            opponent.displayName ??
            opponent.ownerName ??
            "Unknown person",
          opponentTeamName:
            opponent.teamName ?? "Unknown team",
          week: matchup.week,
          team: {
            score: team.effectiveScore,
            np: team.nascarPoints,
            anp: team.adjustedNascarPoints,
          },
          opponent: {
            score: opponent.effectiveScore,
            np: opponent.nascarPoints,
            anp: opponent.adjustedNascarPoints,
          },
        };
      };

      return [
        createRecord(matchup.home, matchup.away),
        createRecord(matchup.away, matchup.home),
      ];
    });

    return {
      year: snapshot.season.year,
      teamCount: snapshot.season.teamCount,
      playoffTeamCount: snapshot.season.playoffTeamCount,
      regularSeasonStartWeek: snapshot.season.regularSeasonStartWeek,
      regularSeasonEndWeek: snapshot.season.regularSeasonEndWeek,
      matchups,
      analytics,
    };
  }
}
