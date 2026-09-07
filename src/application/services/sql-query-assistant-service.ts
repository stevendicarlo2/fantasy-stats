import { SafeOperationalError } from "@/application/errors";
import { format as formatSql } from "sql-formatter";
import type {
  GeneratedSqlQuery,
  SqlQueryGenerationUpdate,
  SqlQueryGenerator,
} from "@/application/ports/sql-query-generator";

import { normalizeSqlConsoleQuery } from "./sql-console-service";

export const SQL_QUERY_REQUEST_MAX_LENGTH = 2_000;

function formatGeneratedSql(statement: string) {
  try {
    return formatSql(statement, {
      language: "sqlite",
      keywordCase: "upper",
      tabWidth: 2,
    });
  } catch {
    throw new SafeOperationalError(
      "Copilot generated SQL that could not be formatted",
    );
  }
}

export class SqlQueryAssistantService {
  private availability: Promise<boolean> | null = null;

  constructor(private readonly generator: SqlQueryGenerator) {}

  isAvailable() {
    this.availability ??= this.generator.checkAvailability();
    return this.availability;
  }

  async generate(
    request: string,
    onUpdate?: (update: SqlQueryGenerationUpdate) => void,
    signal?: AbortSignal,
  ): Promise<GeneratedSqlQuery> {
    const trimmedRequest = request.trim();

    if (trimmedRequest.length === 0) {
      throw new SafeOperationalError(
        "Describe the data you want to query",
      );
    }

    if (trimmedRequest.length > SQL_QUERY_REQUEST_MAX_LENGTH) {
      throw new SafeOperationalError(
        `Query requests must not exceed ${SQL_QUERY_REQUEST_MAX_LENGTH} characters`,
      );
    }

    const generatedQuery = await this.generator.generate(
      trimmedRequest,
      onUpdate,
      signal,
    );
    const normalizedQuery = normalizeSqlConsoleQuery(
      generatedQuery.statement,
      generatedQuery.parameters,
    );
    const formattedQuery = normalizeSqlConsoleQuery(
      formatGeneratedSql(normalizedQuery.statement),
      normalizedQuery.parameters,
    );

    return {
      response: generatedQuery.response,
      ...formattedQuery,
    };
  }
}
