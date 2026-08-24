import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createWebRuntime,
  WebStorageConfigurationError,
} from "./web-runtime-core";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true }),
    ),
  );
});

const espnEnvironment = {
  ESPN_LEAGUE_ID: "123456",
  ESPN_EARLIEST_SEASON: "2017",
  ESPN_S2: "synthetic-cookie",
  ESPN_SWID: "{00000000-0000-0000-0000-000000000000}",
};

describe("createWebRuntime", () => {
  it("rejects nonpersistent dummy storage", async () => {
    await expect(
      createWebRuntime({
        ...espnEnvironment,
        FANTASY_STATS_STORAGE: "dummy",
      }),
    ).rejects.toThrow(WebStorageConfigurationError);
  });

  it("creates and migrates persistent local storage", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-web-runtime-"),
    );
    temporaryDirectories.push(directory);
    const runtime = await createWebRuntime({
      ...espnEnvironment,
      FANTASY_STATS_STORAGE: "local",
      FANTASY_STATS_LOCAL_DATABASE_FILE: join(directory, "database.db"),
    });

    expect(runtime.storage.kind).toBe("local");
    await expect(runtime.storage.database.listImportRuns()).resolves.toEqual(
      [],
    );
    runtime.storage.close();
  });
});
