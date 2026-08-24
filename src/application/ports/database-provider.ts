import type {
  CanonicalId,
  ImportOperation,
  ImportRun,
  IsoDateTime,
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

export interface DatabaseProvider {
  runMigrations(): Promise<MigrationResult>;

  listSourceMappings(provider: string): Promise<SourceMapping[]>;

  startImportRun(input: StartImportRunInput): Promise<ImportRun>;
  commitSeasonImport(input: CommitSeasonImportInput): Promise<ImportRun>;
  failImportRun(input: FailImportRunInput): Promise<ImportRun>;

  getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null>;

  listMatchupOverrides(seasonId: CanonicalId): Promise<MatchupOverride[]>;
  saveMatchupOverride(
    matchupOverride: MatchupOverride,
  ): Promise<MatchupOverride>;
  deleteMatchupOverride(matchupOverrideId: CanonicalId): Promise<boolean>;

  executeReadOnlyQuery(query: ReadOnlyQuery): Promise<ReadOnlyQueryResult>;
}
