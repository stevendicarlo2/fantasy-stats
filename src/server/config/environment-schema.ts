import { z } from "zod";

import { SafeOperationalError } from "@/application/errors";

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

const requiredSecret = z
  .string()
  .trim()
  .min(1, "is required")
  .refine(
    (value) => !value.startsWith("replace-with-"),
    "must replace the example placeholder",
  );

const tursoUrl = requiredSecret.pipe(
  z
    .url("must be a valid URL")
    .refine(
      (value) => ["libsql:", "https:", "http:"].includes(new URL(value).protocol),
      "must use the libsql, https, or http protocol",
    )
    .refine(
      (value) => new URL(value).hostname !== "your-database.turso.io",
      "must replace the example placeholder",
    ),
);

const databaseEnvironmentSchema = z.object({
  TURSO_DATABASE_URL: tursoUrl,
  TURSO_AUTH_TOKEN: requiredSecret,
});

const espnEnvironmentSchema = z.object({
  ESPN_LEAGUE_ID: z.coerce.number().int().positive(),
  ESPN_EARLIEST_SEASON: z.coerce.number().int().min(1900).max(2100),
  ESPN_S2: requiredSecret,
  ESPN_SWID: requiredSecret,
});

export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type EspnEnvironment = z.infer<typeof espnEnvironmentSchema>;

export class EnvironmentConfigurationError extends SafeOperationalError {
  constructor(service: string, issues: z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => `${issue.path.join(".") || "environment"} ${issue.message}`)
      .join("; ");

    super(`${service} configuration is invalid: ${details}`);
    this.name = "EnvironmentConfigurationError";
  }
}

function parseEnvironment<T>(
  service: string,
  schema: z.ZodType<T>,
  environment: EnvironmentValues,
): T {
  const result = schema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError(service, result.error.issues);
  }

  return result.data;
}

export function parseDatabaseEnvironment(
  environment: EnvironmentValues,
): DatabaseEnvironment {
  return parseEnvironment("Database", databaseEnvironmentSchema, environment);
}

export function parseEspnEnvironment(
  environment: EnvironmentValues,
): EspnEnvironment {
  return parseEnvironment("ESPN", espnEnvironmentSchema, environment);
}
