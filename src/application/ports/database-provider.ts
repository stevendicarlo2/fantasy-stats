import type {
  CanonicalId,
  ImportOperation,
  ImportRun,
  IsoDateTime,
  MatchupPhase,
  MatchupOverride,
  SeasonImportSnapshot,
  SourceMapping,
} from "@/domain/types";

export interface MigrationResult {
  appliedMigrations: string[];
}

export type SqlParameter = string | number | null;
export type SqlValue = string | number | null;

export interface ReadOnlyQuery {
  statement: string;
  parameters?: SqlParameter[];
}

export interface ReadOnlyQueryResult {
  columns: string[];
  rows: Record<string, SqlValue>[];
}

export interface StartImportRunInput {
  id: CanonicalId;
  provider: string;
  operation: ImportOperation;
  seasonYear: number;
  startedAt: IsoDateTime;
}

export interface CommitSeasonImportInput {
  importRunId: CanonicalId;
  snapshot: SeasonImportSnapshot;
  completedAt: IsoDateTime;
}

export interface FailImportRunInput {
  importRunId: CanonicalId;
  completedAt: IsoDateTime;
  errorMessage: string;
}

export interface SeasonStanding {
  seasonYear: number;
  franchiseId: CanonicalId;
  teamName: string | null;
  ownerName: string | null;
  weeksPlayed: number;
  totalNascarPoints: number;
  totalHeadToHeadBonus: number;
  totalAdjustedNascarPoints: number;
  qualificationRank: number;
}

export interface WeeklyTeamResult {
  seasonYear: number;
  matchupId: CanonicalId;
  matchupSide: "home" | "away";
  week: number;
  phase: MatchupPhase;
  franchiseId: CanonicalId;
  teamName: string | null;
  ownerName: string | null;
  opponentFranchiseId: CanonicalId | null;
  opponentTeamName: string | null;
  effectiveScore: number;
  scoreAdjustment: number;
  nascarPoints: number;
  headToHeadBonus: number | null;
  adjustedNascarPoints: number | null;
}

export interface DatabaseProvider {
  runMigrations(): Promise<MigrationResult>;

  listSourceMappings(provider: string): Promise<SourceMapping[]>;

  startImportRun(input: StartImportRunInput): Promise<ImportRun>;
  commitSeasonImport(input: CommitSeasonImportInput): Promise<ImportRun>;
  failImportRun(input: FailImportRunInput): Promise<ImportRun>;
  listImportRuns(limit?: number): Promise<ImportRun[]>;

  getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null>;
  listSeasonStandings(seasonYear: number): Promise<SeasonStanding[]>;
  listWeeklyTeamResults(seasonYear: number): Promise<WeeklyTeamResult[]>;

  listMatchupOverrides(seasonId: CanonicalId): Promise<MatchupOverride[]>;
  saveMatchupOverride(
    matchupOverride: MatchupOverride,
  ): Promise<MatchupOverride>;
  deleteMatchupOverride(matchupOverrideId: CanonicalId): Promise<boolean>;

  executeReadOnlyQuery(query: ReadOnlyQuery): Promise<ReadOnlyQueryResult>;
}
