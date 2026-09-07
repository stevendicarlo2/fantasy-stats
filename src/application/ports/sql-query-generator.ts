import type { SqlParameter } from "./database-provider";

export interface GeneratedSqlQuery {
  statement: string;
  parameters: SqlParameter[];
}

export interface SqlQueryGenerator {
  checkAvailability(): Promise<boolean>;
  generate(request: string): Promise<GeneratedSqlQuery>;
}
