import { SafeOperationalError } from "@/application/errors";
import type {
  DatabaseProvider,
  ReadOnlyQueryResult,
  SqlParameter,
} from "@/application/ports/database-provider";

export const SQL_CONSOLE_MAX_ROWS = 500;
const SQL_CONSOLE_MAX_STATEMENT_LENGTH = 20_000;
const SQL_CONSOLE_MAX_PARAMETERS = 50;

export interface SqlConsoleResult extends ReadOnlyQueryResult {
  rowCount: number;
  truncated: boolean;
}

type SqlConsoleDatabase = Pick<DatabaseProvider, "executeReadOnlyQuery">;

export class SqlConsoleService {
  constructor(private readonly database: SqlConsoleDatabase) {}

  async execute(
    statement: string,
    parameters: SqlParameter[],
  ): Promise<SqlConsoleResult> {
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

    const result = await this.database.executeReadOnlyQuery({
      statement: trimmedStatement,
      parameters,
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
