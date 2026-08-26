import { SafeOperationalError } from "@/application/errors";
import type {
  CommitSeasonImportInput,
  DatabaseProvider,
  FailImportRunInput,
  ReadOnlyQuery,
  ReadOnlyQueryResult,
  StartImportRunInput,
  WeeklyTeamResult,
} from "@/application/ports/database-provider";
import {
  importRunSchema,
  franchiseDisplayNameSchema,
  matchupOverrideSchema,
  seasonImportSnapshotSchema,
} from "@/domain/schemas";
import type {
  CanonicalId,
  FranchiseDisplayName,
  ImportRun,
  MatchupOverride,
  SeasonImportSnapshot,
  SourceMapping,
} from "@/domain/types";

export class UnsupportedDummyStorageOperationError extends SafeOperationalError {
  constructor(operation: string) {
    super(`Dummy storage does not support ${operation}`);
    this.name = "UnsupportedDummyStorageOperationError";
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class DummyDatabaseProvider implements DatabaseProvider {
  private readonly snapshots = new Map<number, SeasonImportSnapshot>();
  private readonly importRuns = new Map<CanonicalId, ImportRun>();
  private readonly overrides = new Map<CanonicalId, MatchupOverride>();
  private readonly displayNames = new Map<
    CanonicalId,
    FranchiseDisplayName
  >();

  async runMigrations() {
    return { appliedMigrations: [] };
  }

  async listSourceMappings(provider: string): Promise<SourceMapping[]> {
    const mappings = new Map<string, SourceMapping>();

    for (const snapshot of this.snapshots.values()) {
      for (const mapping of snapshot.sourceMappings) {
        if (mapping.provider !== provider) {
          continue;
        }

        mappings.set(
          `${mapping.entityType}\u0000${mapping.externalId}`,
          mapping,
        );
      }
    }

    return copy([...mappings.values()]);
  }

  async listFranchiseDisplayNames(): Promise<FranchiseDisplayName[]> {
    return copy([...this.displayNames.values()]);
  }

  async saveFranchiseDisplayName(
    displayName: FranchiseDisplayName,
  ): Promise<FranchiseDisplayName> {
    const validatedDisplayName =
      franchiseDisplayNameSchema.parse(displayName);
    const franchiseExists = [...this.snapshots.values()].some((snapshot) =>
      snapshot.franchises.some(
        (franchise) => franchise.id === validatedDisplayName.franchiseId,
      ),
    );

    if (!franchiseExists) {
      throw new SafeOperationalError(
        "A display name must target an imported franchise",
      );
    }

    this.displayNames.set(
      validatedDisplayName.franchiseId,
      copy(validatedDisplayName),
    );
    return copy(validatedDisplayName);
  }

  async startImportRun(input: StartImportRunInput): Promise<ImportRun> {
    if (this.importRuns.has(input.id)) {
      throw new SafeOperationalError(
        `Import run ${input.id} already exists in dummy storage`,
      );
    }

    const importRun = importRunSchema.parse({
      ...input,
      status: "running",
      completedAt: null,
      errorMessage: null,
    });
    this.importRuns.set(importRun.id, importRun);
    return copy(importRun);
  }

  async commitSeasonImport(
    input: CommitSeasonImportInput,
  ): Promise<ImportRun> {
    const snapshot = seasonImportSnapshotSchema.parse(input.snapshot);
    const runningImport = this.requireRunningImport(input.importRunId);
    const succeededImport = importRunSchema.parse({
      ...runningImport,
      status: "succeeded",
      completedAt: input.completedAt,
      errorMessage: null,
    });

    this.snapshots.set(snapshot.season.year, copy(snapshot));
    this.importRuns.set(succeededImport.id, succeededImport);
    return copy(succeededImport);
  }

  async failImportRun(input: FailImportRunInput): Promise<ImportRun> {
    const runningImport = this.requireRunningImport(input.importRunId);
    const failedImport = importRunSchema.parse({
      ...runningImport,
      status: "failed",
      completedAt: input.completedAt,
      errorMessage: input.errorMessage,
    });

    this.importRuns.set(failedImport.id, failedImport);
    return copy(failedImport);
  }

  async listImportRuns(limit = 20): Promise<ImportRun[]> {
    return copy(
      [...this.importRuns.values()]
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, limit),
    );
  }

  async hasSeasonImport(seasonYear: number): Promise<boolean> {
    return this.snapshots.has(seasonYear);
  }

  async getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null> {
    const snapshot = this.snapshots.get(seasonYear);
    return snapshot ? copy(snapshot) : null;
  }

  async listWeeklyTeamResults(
    seasonYear: number,
  ): Promise<WeeklyTeamResult[]> {
    void seasonYear;
    throw new UnsupportedDummyStorageOperationError("weekly team results");
  }

  async listMatchupOverrides(
    seasonId: CanonicalId,
  ): Promise<MatchupOverride[]> {
    const season = [...this.snapshots.values()].find(
      (snapshot) => snapshot.season.id === seasonId,
    );

    if (!season) {
      return [];
    }

    const matchupIds = new Set(
      season.matchups.map((matchup) => matchup.id),
    );

    return copy(
      [...this.overrides.values()].filter((matchupOverride) =>
        matchupIds.has(matchupOverride.matchupId),
      ),
    );
  }

  async saveMatchupOverride(
    matchupOverride: MatchupOverride,
  ): Promise<MatchupOverride> {
    const validatedOverride = matchupOverrideSchema.parse(matchupOverride);
    const matchup = [...this.snapshots.values()]
      .flatMap((snapshot) => snapshot.matchups)
      .find((candidate) => candidate.id === validatedOverride.matchupId);

    if (
      !matchup ||
      (matchup.homeFranchiseId !== validatedOverride.franchiseId &&
        matchup.awayFranchiseId !== validatedOverride.franchiseId)
    ) {
      throw new SafeOperationalError(
        "A dummy matchup override must target a participating franchise",
      );
    }

    this.overrides.set(validatedOverride.id, copy(validatedOverride));
    return copy(validatedOverride);
  }

  async deleteMatchupOverride(
    matchupOverrideId: CanonicalId,
  ): Promise<boolean> {
    return this.overrides.delete(matchupOverrideId);
  }

  async executeReadOnlyQuery(
    query: ReadOnlyQuery,
  ): Promise<ReadOnlyQueryResult> {
    void query;
    throw new UnsupportedDummyStorageOperationError("arbitrary SQL queries");
  }

  close() {}

  private requireRunningImport(importRunId: CanonicalId) {
    const importRun = this.importRuns.get(importRunId);

    if (!importRun || importRun.status !== "running") {
      throw new SafeOperationalError(
        `Running import ${importRunId} was not found in dummy storage`,
      );
    }

    return importRun;
  }
}
