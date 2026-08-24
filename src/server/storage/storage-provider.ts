import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { DatabaseProvider } from "@/application/ports/database-provider";
import type { DatabaseEnvironment } from "@/server/config/environment-schema";
import { DummyDatabaseProvider } from "@/server/adapters/database/dummy/dummy-database-provider";
import {
  createLibSqlDatabaseProvider,
  type CloseableDatabaseProvider,
} from "@/server/adapters/database/libsql/libsql-database-provider";

export type StorageKind = "dummy" | "local" | "turso";

export type StorageSelection =
  | { kind: "dummy" }
  | { kind: "local"; databaseFile: string }
  | { kind: "turso"; environment: DatabaseEnvironment };

export interface SelectedStorage {
  kind: StorageKind;
  persistent: boolean;
  database: DatabaseProvider;
  close(): void;
}

export async function createSelectedStorage(
  selection: StorageSelection,
): Promise<SelectedStorage> {
  if (selection.kind === "dummy") {
    const database = new DummyDatabaseProvider();

    return {
      kind: "dummy",
      persistent: false,
      database,
      close() {
        database.close();
      },
    };
  }

  let database: CloseableDatabaseProvider;

  if (selection.kind === "local") {
    const databasePath = resolve(selection.databaseFile);
    await mkdir(dirname(databasePath), { recursive: true });
    database = createLibSqlDatabaseProvider({
      url: pathToFileURL(databasePath).href,
    });
  } else {
    database = createLibSqlDatabaseProvider({
      url: selection.environment.TURSO_DATABASE_URL,
      authToken: selection.environment.TURSO_AUTH_TOKEN,
    });
  }

  return {
    kind: selection.kind,
    persistent: true,
    database,
    close() {
      database.close();
    },
  };
}
