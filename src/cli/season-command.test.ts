import { beforeEach, describe, expect, it, vi } from "vitest";

import { SafeOperationalError } from "@/application/errors";
import type { ImportRun } from "@/domain/types";

import {
  parseSeasonCommand,
  resolveSeasonArguments,
  runSeasonCli,
  SeasonCommandUsageError,
} from "./season-command";

const importRun: ImportRun = {
  id: "10000000-0000-4000-8000-000000000001",
  provider: "synthetic",
  operation: "import",
  seasonYear: 2025,
  status: "succeeded",
  startedAt: "2026-08-23T22:00:00.000Z",
  completedAt: "2026-08-23T22:01:00.000Z",
  errorMessage: null,
};

describe("parseSeasonCommand", () => {
  it("parses import and refresh operations", () => {
    expect(parseSeasonCommand(["import", "--year", "2017"])).toEqual({
      operation: "import",
      year: 2017,
      storage: "local",
      databaseFile: ".data/fantasy-stats.db",
    });
    expect(
      parseSeasonCommand([
        "refresh",
        "--year",
        "2025",
        "--storage",
        "local",
      ]),
    ).toEqual({
      operation: "refresh",
      year: 2025,
      storage: "local",
      databaseFile: ".data/fantasy-stats.db",
    });
  });

  it("rejects invalid syntax and years", () => {
    expect(() => parseSeasonCommand(["delete", "--year", "2025"])).toThrow(
      SeasonCommandUsageError,
    );
    expect(() => parseSeasonCommand(["import", "2025"])).toThrow(
      SeasonCommandUsageError,
    );
    expect(() =>
      parseSeasonCommand(["import", "--year", "2025.5"]),
    ).toThrow(
      SeasonCommandUsageError,
    );
    expect(() =>
      parseSeasonCommand(["import", "--year", "02025"]),
    ).toThrow(
      SeasonCommandUsageError,
    );
    expect(() =>
      parseSeasonCommand([
        "import",
        "--year",
        "2025",
        "--storage",
        "unknown",
      ]),
    ).toThrow("Storage must be one of");
    expect(() =>
      parseSeasonCommand([
        "import",
        "--year",
        "2025",
        "--storage",
        "dummy",
        "--database-file",
        "test.db",
      ]),
    ).toThrow("--database-file can only be used");
  });
});

describe("resolveSeasonArguments", () => {
  it("translates npm --year configuration for convenience scripts", () => {
    expect(
      resolveSeasonArguments(["import"], {
        year: "2017",
        storage: "local",
        databaseFile: "test.db",
      }),
    ).toEqual([
      "import",
      "--year",
      "2017",
      "--storage",
      "local",
      "--database-file",
      "test.db",
    ]);
  });

  it("leaves explicit CLI arguments unchanged", () => {
    expect(
      resolveSeasonArguments(["import", "--year", "2017"], {}),
    ).toEqual(["import", "--year", "2017"]);
  });
});

describe("runSeasonCli", () => {
  const runMigrations = vi.fn();
  const getSeasonImportSnapshot = vi.fn();
  const importSeason = vi.fn();
  const refreshSeason = vi.fn();
  const close = vi.fn();
  const stdout = vi.fn();
  const stderr = vi.fn();
  const createRuntime = vi.fn(() => ({
    storageKind: "dummy" as const,
    persistent: false,
    database: { runMigrations, getSeasonImportSnapshot },
    service: { importSeason, refreshSeason },
    close,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    runMigrations.mockResolvedValue({ appliedMigrations: [] });
    getSeasonImportSnapshot.mockResolvedValue({
      franchises: [{}, {}],
      matchups: [{}, {}, {}],
      scores: [{}, {}, {}, {}, {}, {}],
    });
    importSeason.mockResolvedValue(importRun);
    refreshSeason.mockResolvedValue({
      ...importRun,
      operation: "refresh",
    });
  });

  it("runs migrations and routes import commands", async () => {
    await expect(
      runSeasonCli(["import", "--year", "2025"], createRuntime, {
        stdout,
        stderr,
      }),
    ).resolves.toBe(0);

    expect(runMigrations).toHaveBeenCalledOnce();
    expect(importSeason).toHaveBeenCalledWith(2025);
    expect(refreshSeason).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(
      `Season 2025 import succeeded using dummy storage; 2 franchises; 3 matchups; 6 scores; not persisted; run ${importRun.id}`,
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("routes refresh commands", async () => {
    await expect(
      runSeasonCli(["refresh", "--year", "2025"], createRuntime, {
        stdout,
        stderr,
      }),
    ).resolves.toBe(0);

    expect(refreshSeason).toHaveBeenCalledWith(2025);
  });

  it("passes parsed storage selection to the runtime factory", async () => {
    await runSeasonCli(
      [
        "import",
        "--year",
        "2025",
        "--storage",
        "local",
        "--database-file",
        "custom.db",
      ],
      createRuntime,
      { stdout, stderr },
    );

    expect(createRuntime).toHaveBeenCalledWith({
      operation: "import",
      year: 2025,
      storage: "local",
      databaseFile: "custom.db",
    });
  });

  it("returns usage errors without creating runtime resources", async () => {
    await expect(
      runSeasonCli(["import"], createRuntime, { stdout, stderr }),
    ).resolves.toBe(2);

    expect(createRuntime).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith(
      "Usage: npm run import-season --year=<year> [--storage=dummy|local|turso] [--database-file=<path>]",
    );
  });

  it("prints safe operational failures and closes resources", async () => {
    class SyntheticCliError extends SafeOperationalError {
      constructor() {
        super("Synthetic command failure");
      }
    }

    importSeason.mockRejectedValue(new SyntheticCliError());

    await expect(
      runSeasonCli(["import", "--year", "2025"], createRuntime, {
        stdout,
        stderr,
      }),
    ).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith("Synthetic command failure");
    expect(close).toHaveBeenCalledOnce();
  });

  it("hides unknown failure details", async () => {
    importSeason.mockRejectedValue(
      new Error("secret-bearing unknown failure"),
    );

    await runSeasonCli(["import", "--year", "2025"], createRuntime, {
      stdout,
      stderr,
    });

    expect(stderr).toHaveBeenCalledWith(
      "Season command failed unexpectedly",
    );
  });
});
