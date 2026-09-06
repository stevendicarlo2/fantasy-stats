import type { SqlParameter } from "./database-provider";

export interface GeneratedSqlQuery {
  statement: string;
  parameters: SqlParameter[];
}

export interface SqlQueryGenerator {
  generate(request: string): Promise<GeneratedSqlQuery>;
}
