import { describe, expect, it, vi } from "vitest";

import { executeSqlConsoleAction } from "./sql-console-action-logic";
import { executeSqlQueryAssistantAction } from "./sql-console-action-logic";
import { SafeOperationalError } from "@/application/errors";

describe("executeSqlConsoleAction", () => {
  it("parses JSON parameters and returns query results", async () => {
    const service = {
      execute: vi.fn().mockResolvedValue({
        columns: ["season_year"],
        rows: [{ season_year: 2017 }],
        rowCount: 1,
        truncated: false,
      }),
    };
    const formData = new FormData();
    formData.set("statement", "SELECT ? AS season_year");
    formData.set("parameters", '[2017, "regular", null]');

    await expect(
      executeSqlConsoleAction(formData, () => service),
    ).resolves.toMatchObject({
      status: "success",
      message: "Query returned 1 row",
    });
    expect(service.execute).toHaveBeenCalledWith(
      "SELECT ? AS season_year",
      [2017, "regular", null],
    );
  });

  it("rejects invalid parameter values before loading the service", async () => {
    const formData = new FormData();
    formData.set("statement", "SELECT ?");
    formData.set("parameters", "[true]");

    await expect(
      executeSqlConsoleAction(formData, () => {
        throw new Error("Service should not be loaded");
      }),
    ).resolves.toEqual({
      status: "error",
      message:
        "Parameters may contain only strings, finite numbers, and null",
      result: null,
      generatedQuery: null,
    });
  });

  it("returns safe provider errors", async () => {
    const formData = new FormData();
    formData.set("statement", "DELETE FROM seasons");
    formData.set("parameters", "[]");

    await expect(
      executeSqlConsoleAction(formData, () => ({
        execute: vi
          .fn()
          .mockRejectedValue(
            new SafeOperationalError(
              "Read-only queries cannot contain DELETE",
            ),
          ),
      })),
    ).resolves.toMatchObject({
      status: "error",
      message: "Read-only queries cannot contain DELETE",
    });
  });

  it("generates a query without executing it", async () => {
    const assistant = {
      generate: vi.fn().mockResolvedValue({
        response: "I generated a season query.",
        statement: "SELECT year FROM seasons WHERE year = ?",
        parameters: [2017],
      }),
    };
    const console = { execute: vi.fn() };
    const formData = new FormData();
    formData.set("request", "Show the 2017 season");

    await expect(
      executeSqlQueryAssistantAction(formData, false, () => ({
        assistant,
        console,
      })),
    ).resolves.toEqual({
      status: "success",
      message: "Query generated. Review or run it below.",
      result: null,
      generatedQuery: {
        statement: "SELECT year FROM seasons WHERE year = ?",
        parameters: "[2017]",
      },
    });
    expect(console.execute).not.toHaveBeenCalled();
  });

  it("executes a generated query through the console service", async () => {
    const query = {
      response: "I generated a season query.",
      statement: "SELECT year FROM seasons WHERE year = ?",
      parameters: [2017],
    };
    const result = {
      columns: ["year"],
      rows: [{ year: 2017 }],
      rowCount: 1,
      truncated: false,
    };
    const assistant = { generate: vi.fn().mockResolvedValue(query) };
    const console = { execute: vi.fn().mockResolvedValue(result) };
    const formData = new FormData();
    formData.set("request", "Show the 2017 season");

    await expect(
      executeSqlQueryAssistantAction(formData, true, () => ({
        assistant,
        console,
      })),
    ).resolves.toMatchObject({
      status: "success",
      message: "Query generated. Query returned 1 row",
      result,
      generatedQuery: {
        statement: query.statement,
        parameters: "[2017]",
      },
    });
    expect(console.execute).toHaveBeenCalledWith(
      query.statement,
      query.parameters,
    );
  });

  it("keeps a rejected generated query visible for correction", async () => {
    const formData = new FormData();
    formData.set("request", "Delete imported seasons");

    await expect(
      executeSqlQueryAssistantAction(formData, true, () => ({
        assistant: {
          generate: vi.fn().mockResolvedValue({
            response: "I cannot safely delete seasons, so review this query.",
            statement: "DELETE FROM seasons",
            parameters: [],
          }),
        },
        console: {
          execute: vi
            .fn()
            .mockRejectedValue(
              new SafeOperationalError(
                "Read-only queries cannot contain DELETE",
              ),
            ),
        },
      })),
    ).resolves.toEqual({
      status: "error",
      message: "Read-only queries cannot contain DELETE",
      result: null,
      generatedQuery: {
        statement: "DELETE FROM seasons",
        parameters: "[]",
      },
    });
  });
});
