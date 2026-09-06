import { SafeOperationalError } from "@/application/errors";
import type {
  GeneratedSqlQuery,
  SqlQueryGenerator,
} from "@/application/ports/sql-query-generator";

import { normalizeSqlConsoleQuery } from "./sql-console-service";

export const SQL_QUERY_REQUEST_MAX_LENGTH = 2_000;

export class SqlQueryAssistantService {
  constructor(private readonly generator: SqlQueryGenerator) {}

  async generate(request: string): Promise<GeneratedSqlQuery> {
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

    const generatedQuery = await this.generator.generate(trimmedRequest);
    return normalizeSqlConsoleQuery(
      generatedQuery.statement,
      generatedQuery.parameters,
    );
  }
}
