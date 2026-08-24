import { z } from "zod";

import type {
  MigrationResult,
  ReadOnlyQueryResult,
} from "./database-provider";

export const migrationResultSchema: z.ZodType<MigrationResult> = z.object({
  appliedMigrations: z.array(z.string().trim().min(1)),
});

const sqlValueSchema = z.union([z.string(), z.number(), z.null()]);

export const readOnlyQueryResultSchema: z.ZodType<ReadOnlyQueryResult> = z
  .object({
    columns: z.array(z.string().trim().min(1)),
    rows: z.array(z.record(z.string(), sqlValueSchema)),
  })
  .superRefine((result, context) => {
    const columnSet = new Set(result.columns);

    if (columnSet.size !== result.columns.length) {
      context.addIssue({
        code: "custom",
        message: "column names must be unique",
        path: ["columns"],
      });
    }

    result.rows.forEach((row, rowIndex) => {
      const rowColumns = Object.keys(row);

      for (const column of result.columns) {
        if (!(column in row)) {
          context.addIssue({
            code: "custom",
            message: `is missing column ${column}`,
            path: ["rows", rowIndex],
          });
        }
      }

      for (const column of rowColumns) {
        if (!columnSet.has(column)) {
          context.addIssue({
            code: "custom",
            message: `contains unexpected column ${column}`,
            path: ["rows", rowIndex],
          });
        }
      }
    });
  });
