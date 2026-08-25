import { describe, expect, it, vi } from "vitest";

import { executeSqlConsoleAction } from "./sql-console-action-logic";
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
});
