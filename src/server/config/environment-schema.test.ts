import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  parseDatabaseEnvironment,
  parseEspnEnvironment,
} from "./environment-schema";

describe("database environment", () => {
  it("returns validated database credentials", () => {
    expect(
      parseDatabaseEnvironment({
        TURSO_DATABASE_URL: "libsql://fantasy-stats.example.turso.io",
        TURSO_AUTH_TOKEN: "synthetic-token",
      }),
    ).toEqual({
      TURSO_DATABASE_URL: "libsql://fantasy-stats.example.turso.io",
      TURSO_AUTH_TOKEN: "synthetic-token",
    });
  });

  it("reports every missing database value without exposing secrets", () => {
    expect(() => parseDatabaseEnvironment({})).toThrowError(
      EnvironmentConfigurationError,
    );
    expect(() => parseDatabaseEnvironment({})).toThrowError(
      /TURSO_DATABASE_URL.*TURSO_AUTH_TOKEN/,
    );
  });

  it("rejects unsupported database URL protocols", () => {
    expect(() =>
      parseDatabaseEnvironment({
        TURSO_DATABASE_URL: "ftp://example.com/database",
        TURSO_AUTH_TOKEN: "synthetic-token",
      }),
    ).toThrow("must use the libsql, https, or http protocol");
  });
});

describe("ESPN environment", () => {
  it("returns validated ESPN credentials", () => {
    expect(
      parseEspnEnvironment({
        ESPN_S2: "synthetic-cookie",
        ESPN_SWID: "{00000000-0000-0000-0000-000000000000}",
      }),
    ).toEqual({
      ESPN_S2: "synthetic-cookie",
      ESPN_SWID: "{00000000-0000-0000-0000-000000000000}",
    });
  });

  it("rejects blank credentials", () => {
    expect(() =>
      parseEspnEnvironment({
        ESPN_S2: " ",
        ESPN_SWID: "",
      }),
    ).toThrow("ESPN configuration is invalid");
  });
});
