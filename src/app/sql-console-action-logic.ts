import { SafeOperationalError } from "@/application/errors";
import type { SqlParameter } from "@/application/ports/database-provider";
import type {
  SqlConsoleResult,
  SqlConsoleService,
} from "@/application/services/sql-console-service";
import type { SqlQueryAssistantService } from "@/application/services/sql-query-assistant-service";

export interface SqlConsoleActionState {
  status: "idle" | "success" | "error";
  message: string;
  result: SqlConsoleResult | null;
  generatedQuery: {
    statement: string;
    parameters: string;
  } | null;
}

export const initialSqlConsoleActionState: SqlConsoleActionState = {
  status: "idle",
  message: "",
  result: null,
  generatedQuery: null,
};

type ConsoleService = Pick<SqlConsoleService, "execute">;
type AssistantService = Pick<SqlQueryAssistantService, "generate">;

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

function formatResultMessage(result: SqlConsoleResult) {
  return result.truncated
    ? `Query returned ${result.rowCount} rows; showing the first ${result.rows.length}`
    : `Query returned ${result.rowCount} ${
        result.rowCount === 1 ? "row" : "rows"
      }`;
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
      message: formatResultMessage(result),
      result,
      generatedQuery: null,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The SQL query failed unexpectedly",
      result: null,
      generatedQuery: null,
    };
  }
}

export async function executeSqlQueryAssistantAction(
  formData: FormData,
  runGeneratedQuery: boolean,
  getServices: () =>
    | {
        assistant: AssistantService;
        console: ConsoleService;
      }
    | Promise<{
        assistant: AssistantService;
        console: ConsoleService;
      }>,
): Promise<SqlConsoleActionState> {
  let generatedQuery: SqlConsoleActionState["generatedQuery"] = null;

  try {
    const request = requireString(formData, "request");
    const services = await getServices();
    const query = await services.assistant.generate(request);
    generatedQuery = {
      statement: query.statement,
      parameters: JSON.stringify(query.parameters),
    };

    if (!runGeneratedQuery) {
      return {
        status: "success",
        message: "Query generated. Review or run it below.",
        result: null,
        generatedQuery,
      };
    }

    const result = await services.console.execute(
      query.statement,
      query.parameters,
    );

    return {
      status: "success",
      message: `Query generated. ${formatResultMessage(result)}`,
      result,
      generatedQuery,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "Copilot query generation failed unexpectedly",
      result: null,
      generatedQuery,
    };
  }
}
