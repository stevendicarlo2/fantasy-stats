import type {
  CanonicalId,
  FranchiseDisplayName,
  ImportOperation,
  ImportRun,
  ImportDataset,
  IsoDateTime,
  MatchupPhase,
  MatchupRosterDetail,
  MatchupOverride,
  PlayerStatsImportSnapshot,
  RelevantPlayer,
  RosterImportSnapshot,
  SeasonDatasetStatus,
  SeasonImportSnapshot,
  SourceMapping,
  TransactionImportSnapshot,
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
  dataset?: ImportDataset;
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

export interface MarkImportUnavailableInput {
  importRunId: CanonicalId;
  completedAt: IsoDateTime;
  reason: string;
}

export interface CommitRosterImportInput {
  importRunId: CanonicalId;
  snapshot: RosterImportSnapshot;
  completedAt: IsoDateTime;
}

export interface CommitTransactionImportInput {
  importRunId: CanonicalId;
  snapshot: TransactionImportSnapshot;
  completedAt: IsoDateTime;
}

export interface CommitPlayerStatsImportInput {
  importRunId: CanonicalId;
  snapshot: PlayerStatsImportSnapshot;
  completedAt: IsoDateTime;
}

export interface WeeklyTeamResult {
  seasonYear: number;
  matchupId: CanonicalId;
  matchupSide: "home" | "away";
  week: number;
  phase: MatchupPhase;
  franchiseId: CanonicalId;
  teamName: string | null;
  displayName: string | null;
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
  listFranchiseDisplayNames(): Promise<FranchiseDisplayName[]>;
  saveFranchiseDisplayName(
    displayName: FranchiseDisplayName,
  ): Promise<FranchiseDisplayName>;

  startImportRun(input: StartImportRunInput): Promise<ImportRun>;
  commitSeasonImport(input: CommitSeasonImportInput): Promise<ImportRun>;
  commitRosterImport(input: CommitRosterImportInput): Promise<ImportRun>;
  commitTransactionImport(
    input: CommitTransactionImportInput,
  ): Promise<ImportRun>;
  commitPlayerStatsImport(
    input: CommitPlayerStatsImportInput,
  ): Promise<ImportRun>;
  failImportRun(input: FailImportRunInput): Promise<ImportRun>;
  markImportUnavailable(
    input: MarkImportUnavailableInput,
  ): Promise<ImportRun>;
  listImportRuns(limit?: number): Promise<ImportRun[]>;
  listSeasonDatasetStatuses(
    seasonYear: number,
  ): Promise<SeasonDatasetStatus[]>;

  listImportedSeasonYears(): Promise<number[]>;
  hasSeasonImport(seasonYear: number): Promise<boolean>;
  getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null>;
  listRelevantPlayers(seasonYear: number): Promise<RelevantPlayer[]>;
  getMatchupRosterDetail(
    seasonYear: number,
    matchupId: CanonicalId,
  ): Promise<MatchupRosterDetail | null>;
  listWeeklyTeamResults(seasonYear: number): Promise<WeeklyTeamResult[]>;

  listMatchupOverrides(seasonId: CanonicalId): Promise<MatchupOverride[]>;
  saveMatchupOverride(
    matchupOverride: MatchupOverride,
  ): Promise<MatchupOverride>;
  deleteMatchupOverride(matchupOverrideId: CanonicalId): Promise<boolean>;

  executeReadOnlyQuery(query: ReadOnlyQuery): Promise<ReadOnlyQueryResult>;
}
