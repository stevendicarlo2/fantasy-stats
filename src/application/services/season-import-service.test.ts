import { beforeEach, describe, expect, it, vi } from "vitest";

import { SafeOperationalError } from "@/application/errors";
import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { FantasySource } from "@/application/ports/fantasy-source";
import type {
  ImportRun,
  SeasonImportSnapshot,
  SourceMapping,
} from "@/domain/types";

import {
  InvalidSeasonYearError,
  SeasonAlreadyImportedError,
  SeasonImportService,
  SeasonNotImportedError,
} from "./season-import-service";

const ids = {
  league: "10000000-0000-4000-8000-000000000001",
  season: "10000000-0000-4000-8000-000000000002",
  home: "10000000-0000-4000-8000-000000000003",
  away: "10000000-0000-4000-8000-000000000004",
  matchup: "10000000-0000-4000-8000-000000000005",
  importRun: "10000000-0000-4000-8000-000000000006",
};

function createSnapshot(): SeasonImportSnapshot {
  return {
    league: { id: ids.league, name: "Synthetic League" },
    season: {
      id: ids.season,
      leagueId: ids.league,
      year: 2025,
      teamCount: 2,
      regularSeasonStartWeek: 1,
      regularSeasonEndWeek: 1,
    },
    franchises: [
      { id: ids.home, leagueId: ids.league, ownerName: null },
      { id: ids.away, leagueId: ids.league, ownerName: null },
    ],
    franchiseNames: [
      { franchiseId: ids.home, name: "Home Team" },
      { franchiseId: ids.away, name: "Away Team" },
    ],
    matchups: [
      {
        id: ids.matchup,
        seasonId: ids.season,
        week: 1,
        phase: "regular",
        homeFranchiseId: ids.home,
        awayFranchiseId: ids.away,
      },
    ],
    scores: [
      { matchupId: ids.matchup, franchiseId: ids.home, score: 100 },
      { matchupId: ids.matchup, franchiseId: ids.away, score: 90 },
    ],
    sourceMappings: [],
  };
}

function createRunningImportRun(): ImportRun {
  return {
    id: ids.importRun,
    provider: "synthetic",
    operation: "import",
    seasonYear: 2025,
    status: "running",
    startedAt: "2026-08-23T22:00:00.000Z",
    completedAt: null,
    errorMessage: null,
  };
}

function createSucceededImportRun(): ImportRun {
  return {
    ...createRunningImportRun(),
    status: "succeeded",
    completedAt: "2026-08-23T22:01:00.000Z",
  };
}

describe("SeasonImportService", () => {
  const getSeasonImportSnapshot = vi.fn();
  const listSourceMappings = vi.fn();
  const startImportRun = vi.fn();
  const commitSeasonImport = vi.fn();
  const failImportRun = vi.fn();
  const fetchSeason = vi.fn();
  const knownMappings: SourceMapping[] = [
    {
      provider: "synthetic",
      entityType: "league",
      canonicalId: ids.league,
      externalId: "league-1",
    },
  ];
  const database = {
    runMigrations: vi.fn(),
    listSourceMappings,
    startImportRun,
    commitSeasonImport,
    failImportRun,
    getSeasonImportSnapshot,
    listImportRuns: vi.fn(),
    listMatchupOverrides: vi.fn(),
    saveMatchupOverride: vi.fn(),
    deleteMatchupOverride: vi.fn(),
    executeReadOnlyQuery: vi.fn(),
  } satisfies DatabaseProvider;
  const source = {
    provider: "synthetic",
    fetchSeason,
  } satisfies FantasySource;
  const now = vi
    .fn<() => Date>()
    .mockReturnValueOnce(new Date("2026-08-23T22:00:00.000Z"))
    .mockReturnValue(new Date("2026-08-23T22:01:00.000Z"));

  beforeEach(() => {
    vi.clearAllMocks();
    now
      .mockReset()
      .mockReturnValueOnce(new Date("2026-08-23T22:00:00.000Z"))
      .mockReturnValue(new Date("2026-08-23T22:01:00.000Z"));
    getSeasonImportSnapshot.mockResolvedValue(null);
    listSourceMappings.mockResolvedValue(knownMappings);
    startImportRun.mockResolvedValue(createRunningImportRun());
    fetchSeason.mockResolvedValue(createSnapshot());
    commitSeasonImport.mockResolvedValue(createSucceededImportRun());
    failImportRun.mockResolvedValue({
      ...createRunningImportRun(),
      status: "failed",
      completedAt: "2026-08-23T22:01:00.000Z",
      errorMessage: "Synthetic failure",
    });
  });

  function createService() {
    return new SeasonImportService({
      database,
      source,
      createId: () => ids.importRun,
      now,
    });
  }

  it("imports a new season using known provider mappings", async () => {
    const service = createService();

    await expect(service.importSeason(2025)).resolves.toEqual(
      createSucceededImportRun(),
    );
    expect(startImportRun).toHaveBeenCalledWith({
      id: ids.importRun,
      provider: "synthetic",
      operation: "import",
      seasonYear: 2025,
      startedAt: "2026-08-23T22:00:00.000Z",
    });
    expect(fetchSeason).toHaveBeenCalledWith({
      year: 2025,
      knownMappings,
    });
    expect(commitSeasonImport).toHaveBeenCalledWith({
      importRunId: ids.importRun,
      snapshot: createSnapshot(),
      completedAt: "2026-08-23T22:01:00.000Z",
    });
    expect(
      startImportRun.mock.invocationCallOrder[0],
    ).toBeLessThan(fetchSeason.mock.invocationCallOrder[0]);
  });

  it("refreshes only an existing season", async () => {
    getSeasonImportSnapshot.mockResolvedValue(createSnapshot());
    const service = createService();

    await service.refreshSeason(2025);

    expect(startImportRun).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "refresh" }),
    );
  });

  it("rejects import and refresh precondition violations before auditing", async () => {
    const service = createService();
    getSeasonImportSnapshot.mockResolvedValueOnce(createSnapshot());

    await expect(service.importSeason(2025)).rejects.toThrow(
      SeasonAlreadyImportedError,
    );
    getSeasonImportSnapshot.mockResolvedValueOnce(null);
    await expect(service.refreshSeason(2025)).rejects.toThrow(
      SeasonNotImportedError,
    );

    expect(startImportRun).not.toHaveBeenCalled();
    expect(fetchSeason).not.toHaveBeenCalled();
  });

  it("rejects invalid years before database access", async () => {
    const service = createService();

    await expect(service.importSeason(2025.5)).rejects.toThrow(
      InvalidSeasonYearError,
    );
    expect(getSeasonImportSnapshot).not.toHaveBeenCalled();
  });

  it("records safe source failures and rethrows them", async () => {
    class SyntheticSourceError extends SafeOperationalError {
      constructor() {
        super("Synthetic source is unavailable");
        this.name = "SyntheticSourceError";
      }
    }

    const sourceError = new SyntheticSourceError();
    fetchSeason.mockRejectedValue(sourceError);
    const service = createService();

    await expect(service.importSeason(2025)).rejects.toBe(sourceError);
    expect(failImportRun).toHaveBeenCalledWith({
      importRunId: ids.importRun,
      completedAt: "2026-08-23T22:01:00.000Z",
      errorMessage:
        "SyntheticSourceError: Synthetic source is unavailable",
    });
  });

  it("records unknown failures without persisting their messages", async () => {
    const persistenceError = new Error(
      "secret-bearing provider payload must not be audited",
    );
    commitSeasonImport.mockRejectedValue(persistenceError);
    const service = createService();

    await expect(service.importSeason(2025)).rejects.toBe(persistenceError);
    expect(failImportRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Unexpected import failure",
      }),
    );
  });

  it("surfaces both the operation and audit failure", async () => {
    const sourceError = new Error("source failed");
    const auditError = new Error("audit failed");
    fetchSeason.mockRejectedValue(sourceError);
    failImportRun.mockRejectedValue(auditError);
    const service = createService();

    await expect(service.importSeason(2025)).rejects.toMatchObject({
      name: "AggregateError",
      errors: [sourceError, auditError],
    });
  });
});
