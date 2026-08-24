import "server-only";

import { getDatabaseEnvironment } from "@/server/config/environment";

import { createLibSqlDatabaseProvider } from "./libsql-database-provider";

export function createTursoDatabaseProvider() {
  const environment = getDatabaseEnvironment();

  return createLibSqlDatabaseProvider({
    url: environment.TURSO_DATABASE_URL,
    authToken: environment.TURSO_AUTH_TOKEN,
  });
}
