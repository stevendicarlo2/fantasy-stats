export type CanonicalId = string;
export type IsoDateTime = string;

export interface League {
  id: CanonicalId;
  name: string;
}

export interface Season {
  id: CanonicalId;
  leagueId: CanonicalId;
  year: number;
  teamCount: number;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
}

export interface Franchise {
  id: CanonicalId;
  leagueId: CanonicalId;
  ownerName: string | null;
}

export interface FranchiseName {
  franchiseId: CanonicalId;
  name: string;
}

export type MatchupPhase = "regular" | "playoff" | "consolation";

export interface Matchup {
  id: CanonicalId;
  seasonId: CanonicalId;
  week: number;
  phase: MatchupPhase;
  homeFranchiseId: CanonicalId;
  awayFranchiseId: CanonicalId;
}

export interface ImportedMatchupScore {
  matchupId: CanonicalId;
  franchiseId: CanonicalId;
  score: number;
}

export interface MatchupOverride {
  id: CanonicalId;
  matchupId: CanonicalId;
  franchiseId: CanonicalId;
  scoreAdjustment: number;
  reason: string;
  createdAt: IsoDateTime;
}

export type SourceEntityType =
  | "league"
  | "season"
  | "franchise"
  | "matchup";

export interface SourceMapping {
  provider: string;
  entityType: SourceEntityType;
  canonicalId: CanonicalId;
  externalId: string;
}

export type ImportOperation = "import" | "refresh";
export type ImportRunStatus = "running" | "succeeded" | "failed";

export interface ImportRun {
  id: CanonicalId;
  provider: string;
  operation: ImportOperation;
  seasonYear: number;
  status: ImportRunStatus;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  errorMessage: string | null;
}

export interface SeasonImportSnapshot {
  league: League;
  season: Season;
  franchises: Franchise[];
  franchiseNames: FranchiseName[];
  matchups: Matchup[];
  scores: ImportedMatchupScore[];
  sourceMappings: SourceMapping[];
}
