import { SafeOperationalError } from "@/application/errors";
import type {
  AcquireImportRunInput,
  AcquireImportRunResult,
  CommitSeasonImportInput,
  CommitPlayerStatsImportInput,
  CommitRosterImportInput,
  CommitTransactionImportInput,
  DatabaseProvider,
  FailImportRunInput,
  MarkImportUnavailableInput,
  ReadOnlyQuery,
  ReadOnlyQueryResult,
  RenewImportLeaseInput,
  StartImportRunInput,
  WeeklyTeamResult,
} from "@/application/ports/database-provider";
import {
  importRunSchema,
  franchiseDisplayNameSchema,
  matchupOverrideSchema,
  seasonImportSnapshotSchema,
  playerStatsImportSnapshotSchema,
  rosterImportSnapshotSchema,
  transactionImportSnapshotSchema,
} from "@/domain/schemas";
import type {
  CanonicalId,
  FranchiseDisplayName,
  ImportRun,
  MatchupOverride,
  PlayerStatsImportSnapshot,
  RelevantPlayer,
  RosterImportSnapshot,
  SeasonDatasetStatus,
  SeasonImportSnapshot,
  SourceMapping,
  TransactionImportSnapshot,
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
  private readonly syncLeases = new Map<
    string,
    {
      importRunId: CanonicalId;
      ownerToken: string;
      heartbeatAt: string;
      expiresAt: string;
    }
  >();
  private readonly rosterSnapshots = new Map<number, RosterImportSnapshot>();
  private readonly transactionSnapshots = new Map<
    number,
    TransactionImportSnapshot
  >();
  private readonly playerStatsSnapshots = new Map<
    number,
    PlayerStatsImportSnapshot
  >();
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

    for (const supplementalSnapshot of [
      ...this.rosterSnapshots.values(),
      ...this.transactionSnapshots.values(),
      ...this.playerStatsSnapshots.values(),
    ]) {
      for (const mapping of supplementalSnapshot.sourceMappings) {
        if (mapping.provider === provider) {
          mappings.set(
            `${mapping.entityType}\u0000${mapping.externalId}`,
            mapping,
          );
        }
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
      trigger: input.trigger ?? "legacy",
      dataset: input.dataset ?? "core",
      status: "running",
      completedAt: null,
      errorMessage: null,
    });
    this.importRuns.set(importRun.id, importRun);
    return copy(importRun);
  }

  async acquireImportRun(
    input: AcquireImportRunInput,
  ): Promise<AcquireImportRunResult> {
    const dataset = input.dataset ?? "core";
    const key = `${input.seasonYear}:${dataset}`;
    const existing = this.syncLeases.get(key);

    if (existing && existing.expiresAt > input.abandonedAt) {
      return {
        acquired: false,
        run: copy(this.requireImportRun(existing.importRunId)),
      };
    }

    if (existing) {
      const abandoned = this.importRuns.get(existing.importRunId);
      if (abandoned?.status === "running") {
        this.importRuns.set(abandoned.id, {
          ...abandoned,
          status: "failed",
          completedAt: input.abandonedAt,
          errorMessage: "Sync lease expired before the import completed",
        });
      }
      this.syncLeases.delete(key);
    }

    const run = await this.startImportRun(input);
    this.syncLeases.set(key, {
      importRunId: run.id,
      ownerToken: input.ownerToken,
      heartbeatAt: input.startedAt,
      expiresAt: input.leaseExpiresAt,
    });
    return { acquired: true, run };
  }

  async renewImportLease(input: RenewImportLeaseInput): Promise<boolean> {
    const entry = [...this.syncLeases.entries()].find(
      ([, lease]) =>
        lease.importRunId === input.importRunId &&
        lease.ownerToken === input.ownerToken,
    );

    if (!entry) {
      return false;
    }

    this.syncLeases.set(entry[0], {
      ...entry[1],
      heartbeatAt: input.heartbeatAt,
      expiresAt: input.expiresAt,
    });
    return true;
  }

  async getImportRun(importRunId: CanonicalId): Promise<ImportRun | null> {
    const run = this.importRuns.get(importRunId);
    return run ? copy(run) : null;
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
    this.releaseLease(succeededImport.id);
    return copy(succeededImport);
  }

  async commitRosterImport(
    input: CommitRosterImportInput,
  ): Promise<ImportRun> {
    const snapshot = rosterImportSnapshotSchema.parse(input.snapshot);
    const succeededImport = this.completeImport(
      input.importRunId,
      input.completedAt,
    );
    this.rosterSnapshots.set(snapshot.seasonYear, copy(snapshot));
    return copy(succeededImport);
  }

  async commitTransactionImport(
    input: CommitTransactionImportInput,
  ): Promise<ImportRun> {
    const snapshot = transactionImportSnapshotSchema.parse(input.snapshot);
    const succeededImport = this.completeImport(
      input.importRunId,
      input.completedAt,
    );
    this.transactionSnapshots.set(snapshot.seasonYear, copy(snapshot));
    return copy(succeededImport);
  }

  async commitPlayerStatsImport(
    input: CommitPlayerStatsImportInput,
  ): Promise<ImportRun> {
    const snapshot = playerStatsImportSnapshotSchema.parse(input.snapshot);
    const succeededImport = this.completeImport(
      input.importRunId,
      input.completedAt,
    );
    this.playerStatsSnapshots.set(snapshot.seasonYear, copy(snapshot));
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
    this.releaseLease(failedImport.id);
    return copy(failedImport);
  }

  async markImportUnavailable(
    input: MarkImportUnavailableInput,
  ): Promise<ImportRun> {
    const runningImport = this.requireRunningImport(input.importRunId);
    const unavailableImport = importRunSchema.parse({
      ...runningImport,
      status: "unavailable",
      completedAt: input.completedAt,
      errorMessage: input.reason,
    });

    this.importRuns.set(unavailableImport.id, unavailableImport);
    this.releaseLease(unavailableImport.id);
    return copy(unavailableImport);
  }

  async listImportRuns(limit = 20): Promise<ImportRun[]> {
    return copy(
      [...this.importRuns.values()]
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, limit),
    );
  }

  async listSeasonDatasetStatuses(
    seasonYear: number,
  ): Promise<SeasonDatasetStatus[]> {
    const runs = [...this.importRuns.values()]
      .filter((run) => run.seasonYear === seasonYear)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));

    return (
      ["core", "rosters", "transactions", "player_stats"] as const
    ).map((dataset) => {
      const datasetRuns = runs.filter(
        (run) => (run.dataset ?? "core") === dataset,
      );
      const latestAttempt = datasetRuns[0] ?? null;
      const lease = this.syncLeases.get(`${seasonYear}:${dataset}`);
      const activeRun =
        latestAttempt?.status === "running" &&
        lease?.importRunId === latestAttempt.id &&
        lease.expiresAt > new Date().toISOString()
          ? latestAttempt
          : null;
      const latestSuccess =
        datasetRuns.find((run) => run.status === "succeeded") ?? null;
      const consecutiveFailureCount = datasetRuns.filter(
        (run) =>
          run.status === "failed" &&
          (!latestSuccess || run.startedAt > latestSuccess.startedAt),
      ).length;

      return {
        dataset,
        activeRun: activeRun
          ? { id: activeRun.id, startedAt: activeRun.startedAt }
          : null,
        lastSuccessfulStartedAt: latestSuccess?.startedAt ?? null,
        latestAttempt: latestAttempt
          ? {
              id: latestAttempt.id,
              trigger: latestAttempt.trigger ?? "legacy",
              status: latestAttempt.status,
              startedAt: latestAttempt.startedAt,
              completedAt: latestAttempt.completedAt,
              errorMessage: latestAttempt.errorMessage,
            }
          : null,
        consecutiveFailureCount,
      };
    });
  }

  async listImportedSeasonYears(): Promise<number[]> {
    return [...this.snapshots.keys()].sort((left, right) => right - left);
  }

  async hasSeasonImport(seasonYear: number): Promise<boolean> {
    return this.snapshots.has(seasonYear);
  }

  async getHighestActiveSeasonYear(): Promise<number | null> {
    const years = [...this.snapshots.values()]
      .filter((snapshot) => snapshot.season.isActive)
      .map((snapshot) => snapshot.season.year);

    return years.length > 0 ? Math.max(...years) : null;
  }

  async hasLiveNflGame(
    seasonYear: number,
    startsAfter: string,
    startsBefore: string,
  ): Promise<boolean> {
    return (
      this.playerStatsSnapshots
        .get(seasonYear)
        ?.games.some(
          (game) =>
            !game.completed &&
            game.startsAt > startsAfter &&
            game.startsAt <= startsBefore,
        ) ?? false
    );
  }

  async getSeasonImportSnapshot(
    seasonYear: number,
  ): Promise<SeasonImportSnapshot | null> {
    const snapshot = this.snapshots.get(seasonYear);
    return snapshot ? copy(snapshot) : null;
  }

  async listRelevantPlayers(
    seasonYear: number,
  ): Promise<RelevantPlayer[]> {
    const canonicalIds = new Set<string>();
    const roster = this.rosterSnapshots.get(seasonYear);
    const transactions = this.transactionSnapshots.get(seasonYear);

    roster?.entries.forEach((entry) => canonicalIds.add(entry.playerId));
    transactions?.draftPicks.forEach((pick) =>
      canonicalIds.add(pick.playerId),
    );
    transactions?.transactionItems.forEach((item) =>
      canonicalIds.add(item.playerId),
    );

    const players = new Map(
      [
        ...(roster?.players ?? []),
        ...(transactions?.players ?? []),
      ].map((player) => [player.id, player]),
    );
    const mappings = [
      ...(roster?.sourceMappings ?? []),
      ...(transactions?.sourceMappings ?? []),
    ];

    return copy(
      mappings.flatMap((mapping) =>
        mapping.provider === "espn" &&
        mapping.entityType === "player" &&
        canonicalIds.has(mapping.canonicalId) &&
        players.get(mapping.canonicalId)?.kind === "athlete"
          ? [{ id: mapping.canonicalId, externalId: mapping.externalId }]
          : [],
      ),
    );
  }

  async getMatchupRosterDetail(
    seasonYear: number,
    matchupId: CanonicalId,
  ): Promise<never> {
    void seasonYear;
    void matchupId;
    throw new UnsupportedDummyStorageOperationError(
      "matchup roster details",
    );
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

  private requireImportRun(importRunId: CanonicalId) {
    const importRun = this.importRuns.get(importRunId);

    if (!importRun) {
      throw new SafeOperationalError(
        `Import ${importRunId} was not found in dummy storage`,
      );
    }

    return importRun;
  }

  private releaseLease(importRunId: CanonicalId) {
    const entry = [...this.syncLeases.entries()].find(
      ([, lease]) => lease.importRunId === importRunId,
    );

    if (entry) {
      this.syncLeases.delete(entry[0]);
    }
  }

  private completeImport(
    importRunId: CanonicalId,
    completedAt: string,
  ) {
    const runningImport = this.requireRunningImport(importRunId);
    const succeededImport = importRunSchema.parse({
      ...runningImport,
      status: "succeeded",
      completedAt,
      errorMessage: null,
    });
    this.importRuns.set(succeededImport.id, succeededImport);
    this.releaseLease(succeededImport.id);
    return succeededImport;
  }
}
