import type { SqlParameter } from "./database-provider";

export interface GeneratedSqlQuery {
  response: string;
  statement: string;
  parameters: SqlParameter[];
}

export type SqlQueryGenerationUpdate =
  | {
      type: "progress";
      message: string;
    }
  | {
      type: "response-delta";
      delta: string;
    };

export interface SqlQueryGenerator {
  checkAvailability(): Promise<boolean>;
  generate(
    request: string,
    onUpdate?: (update: SqlQueryGenerationUpdate) => void,
    signal?: AbortSignal,
  ): Promise<GeneratedSqlQuery>;
}
