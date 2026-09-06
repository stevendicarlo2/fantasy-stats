import { SafeOperationalError } from "@/application/errors";
import type {
  DatabaseProvider,
  ReadOnlyQueryResult,
  SqlParameter,
} from "@/application/ports/database-provider";

export const SQL_CONSOLE_MAX_ROWS = 500;
export const SQL_CONSOLE_MAX_STATEMENT_LENGTH = 20_000;
export const SQL_CONSOLE_MAX_PARAMETERS = 50;

export interface SqlConsoleResult extends ReadOnlyQueryResult {
  rowCount: number;
  truncated: boolean;
}

type SqlConsoleDatabase = Pick<DatabaseProvider, "executeReadOnlyQuery">;

export function normalizeSqlConsoleQuery(
  statement: string,
  parameters: SqlParameter[],
) {
  const trimmedStatement = statement.trim();

  if (trimmedStatement.length === 0) {
    throw new SafeOperationalError("Enter a SQL query");
  }

  if (trimmedStatement.length > SQL_CONSOLE_MAX_STATEMENT_LENGTH) {
    throw new SafeOperationalError(
      `SQL queries must not exceed ${SQL_CONSOLE_MAX_STATEMENT_LENGTH} characters`,
    );
  }

  if (parameters.length > SQL_CONSOLE_MAX_PARAMETERS) {
    throw new SafeOperationalError(
      `SQL queries support at most ${SQL_CONSOLE_MAX_PARAMETERS} parameters`,
    );
  }

  return {
    statement: trimmedStatement,
    parameters,
  };
}

export class SqlConsoleService {
  constructor(private readonly database: SqlConsoleDatabase) {}

  async execute(
    statement: string,
    parameters: SqlParameter[],
  ): Promise<SqlConsoleResult> {
    const query = normalizeSqlConsoleQuery(statement, parameters);

    const result = await this.database.executeReadOnlyQuery({
      statement: query.statement,
      parameters: query.parameters,
    });
    const truncated = result.rows.length > SQL_CONSOLE_MAX_ROWS;

    return {
      columns: result.columns,
      rows: result.rows.slice(0, SQL_CONSOLE_MAX_ROWS),
      rowCount: result.rows.length,
      truncated,
    };
  }
}
