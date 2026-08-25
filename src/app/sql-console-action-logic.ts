import { SafeOperationalError } from "@/application/errors";
import type { SqlParameter } from "@/application/ports/database-provider";
import type {
  SqlConsoleResult,
  SqlConsoleService,
} from "@/application/services/sql-console-service";

export interface SqlConsoleActionState {
  status: "idle" | "success" | "error";
  message: string;
  result: SqlConsoleResult | null;
}

export const initialSqlConsoleActionState: SqlConsoleActionState = {
  status: "idle",
  message: "",
  result: null,
};

type ConsoleService = Pick<SqlConsoleService, "execute">;

function requireString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string") {
    throw new SafeOperationalError(`Missing ${name}`);
  }

  return value;
}

function parseParameters(value: string): SqlParameter[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SafeOperationalError(
      "Parameters must be a valid JSON array",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new SafeOperationalError("Parameters must be a JSON array");
  }

  if (
    !parsed.every(
      (parameter) =>
        parameter === null ||
        typeof parameter === "string" ||
        (typeof parameter === "number" && Number.isFinite(parameter)),
    )
  ) {
    throw new SafeOperationalError(
      "Parameters may contain only strings, finite numbers, and null",
    );
  }

  return parsed;
}

export async function executeSqlConsoleAction(
  formData: FormData,
  getService: () => ConsoleService | Promise<ConsoleService>,
): Promise<SqlConsoleActionState> {
  try {
    const statement = requireString(formData, "statement");
    const parameters = parseParameters(
      requireString(formData, "parameters"),
    );
    const service = await getService();
    const result = await service.execute(statement, parameters);

    return {
      status: "success",
      message: result.truncated
        ? `Query returned ${result.rowCount} rows; showing the first ${result.rows.length}`
        : `Query returned ${result.rowCount} ${
            result.rowCount === 1 ? "row" : "rows"
          }`,
      result,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The SQL query failed unexpectedly",
      result: null,
    };
  }
}
