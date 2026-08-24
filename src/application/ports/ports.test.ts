import { describe, expect, it } from "vitest";

import type {
  DatabaseProvider,
  ReadOnlyQueryResult,
} from "./database-provider";
import type { FantasySource } from "./fantasy-source";
import {
  migrationResultSchema,
  readOnlyQueryResultSchema,
} from "./schemas";

const databaseProviderContract = {
  async runMigrations() {
    return { appliedMigrations: [] };
  },
  async listSourceMappings() {
    return [];
  },
  async startImportRun(input) {
    return {
      ...input,
      status: "running" as const,
      completedAt: null,
      errorMessage: null,
    };
  },
  async commitSeasonImport(input) {
    return {
      id: input.importRunId,
      provider: "synthetic",
      operation: "import" as const,
      seasonYear: input.snapshot.season.year,
      status: "succeeded" as const,
      startedAt: "2026-08-23T23:00:00Z",
      completedAt: input.completedAt,
      errorMessage: null,
    };
  },
  async failImportRun(input) {
    return {
      id: input.importRunId,
      provider: "synthetic",
      operation: "import" as const,
      seasonYear: 2025,
      status: "failed" as const,
      startedAt: "2026-08-23T23:00:00Z",
      completedAt: input.completedAt,
      errorMessage: input.errorMessage,
    };
  },
  async getSeasonImportSnapshot() {
    return null;
  },
  async listMatchupOverrides() {
    return [];
  },
  async saveMatchupOverride(matchupOverride) {
    return matchupOverride;
  },
  async deleteMatchupOverride() {
    return false;
  },
  async executeReadOnlyQuery() {
    return { columns: [], rows: [] };
  },
} satisfies DatabaseProvider;

const fantasySourceContract = {
  provider: "synthetic",
  async fetchSeason() {
    throw new Error("Synthetic contract method");
  },
} satisfies FantasySource;

describe("provider interfaces", () => {
  it("can be implemented without provider-specific result types", () => {
    expect(databaseProviderContract).toBeDefined();
    expect(fantasySourceContract.provider).toBe("synthetic");
  });
});

describe("migrationResultSchema", () => {
  it("accepts application-owned migration results", () => {
    expect(
      migrationResultSchema.parse({
        appliedMigrations: ["001_initial_schema.sql"],
      }),
    ).toEqual({ appliedMigrations: ["001_initial_schema.sql"] });
  });
});

describe("readOnlyQueryResultSchema", () => {
  it("accepts rectangular query results", () => {
    const result: ReadOnlyQueryResult = {
      columns: ["franchise", "anp"],
      rows: [{ franchise: "Synthetic Team", anp: 14.5 }],
    };

    expect(readOnlyQueryResultSchema.parse(result)).toEqual(result);
  });

  it("rejects rows missing a declared column", () => {
    expect(() =>
      readOnlyQueryResultSchema.parse({
        columns: ["franchise", "anp"],
        rows: [{ franchise: "Synthetic Team" }],
      }),
    ).toThrow("is missing column anp");
  });

  it("rejects provider-specific or unsupported values", () => {
    expect(() =>
      readOnlyQueryResultSchema.parse({
        columns: ["payload"],
        rows: [{ payload: new Uint8Array([1, 2, 3]) }],
      }),
    ).toThrow();
  });
});
