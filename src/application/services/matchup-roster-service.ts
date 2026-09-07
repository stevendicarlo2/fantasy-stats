import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { CanonicalId } from "@/domain/types";

type MatchupRosterDatabase = Pick<
  DatabaseProvider,
  "getMatchupRosterDetail"
>;

export class MatchupRosterService {
  constructor(private readonly database: MatchupRosterDatabase) {}

  getMatchupRoster(seasonYear: number, matchupId: CanonicalId) {
    return this.database.getMatchupRosterDetail(seasonYear, matchupId);
  }
}
