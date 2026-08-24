import "server-only";

import {
  createLibSqlDatabaseProvider,
  LibSqlDatabaseError,
  type CloseableDatabaseProvider,
} from "./libsql-database-provider";
import { MigrationConfigurationError } from "./migration-runner";

export {
  createLocalMigrationRunner,
  MigrationIntegrityError,
  type LocalMigrationRunner,
  type LocalMigrationRunnerOptions,
} from "./migration-runner";
export { LibSqlDatabaseError, type CloseableDatabaseProvider };

export function createLocalDatabaseProvider(
  databaseUrl: string,
  migrationsDirectory?: string,
) {
  if (!databaseUrl.startsWith("file:")) {
    throw new MigrationConfigurationError(
      "Local databases must use a file: URL",
    );
  }

  return createLibSqlDatabaseProvider({ url: databaseUrl, migrationsDirectory });
}

export { MigrationConfigurationError };
