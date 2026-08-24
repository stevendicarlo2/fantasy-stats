import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSelectedStorage } from "./storage-provider";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true }),
    ),
  );
});

describe("createSelectedStorage", () => {
  it("creates nonpersistent dummy storage without configuration", async () => {
    const storage = await createSelectedStorage({ kind: "dummy" });

    expect(storage.kind).toBe("dummy");
    expect(storage.persistent).toBe(false);
    await expect(storage.database.runMigrations()).resolves.toEqual({
      appliedMigrations: [],
    });
    storage.close();
  });

  it("creates and migrates persistent local storage", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "fantasy-stats-selected-storage-"),
    );
    temporaryDirectories.push(directory);
    const storage = await createSelectedStorage({
      kind: "local",
      databaseFile: join(directory, "nested", "fantasy-stats.db"),
    });

    expect(storage.kind).toBe("local");
    expect(storage.persistent).toBe(true);
    await expect(storage.database.runMigrations()).resolves.toMatchObject({
      appliedMigrations: expect.arrayContaining([
        "0001_initial_schema.sql",
      ]),
    });
    storage.close();
  });
});
