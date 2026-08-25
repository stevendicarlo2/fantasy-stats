import { describe, expect, it, vi } from "vitest";

import {
  SQL_CONSOLE_MAX_ROWS,
  SqlConsoleService,
} from "./sql-console-service";

describe("SqlConsoleService", () => {
  it("passes trimmed SQL and application-owned parameters to storage", async () => {
    const database = {
      executeReadOnlyQuery: vi.fn().mockResolvedValue({
        columns: ["season_year"],
        rows: [{ season_year: 2017 }],
      }),
    };
    const service = new SqlConsoleService(database);

    await expect(
      service.execute("  SELECT ? AS season_year  ", [2017]),
    ).resolves.toEqual({
      columns: ["season_year"],
      rows: [{ season_year: 2017 }],
      rowCount: 1,
      truncated: false,
    });
    expect(database.executeReadOnlyQuery).toHaveBeenCalledWith({
      statement: "SELECT ? AS season_year",
      parameters: [2017],
    });
  });

  it("rejects blank queries before accessing storage", async () => {
    const database = { executeReadOnlyQuery: vi.fn() };
    const service = new SqlConsoleService(database);

    await expect(service.execute(" ", [])).rejects.toThrow(
      "Enter a SQL query",
    );
    expect(database.executeReadOnlyQuery).not.toHaveBeenCalled();
  });

  it("returns at most the console row limit and reports truncation", async () => {
    const rows = Array.from(
      { length: SQL_CONSOLE_MAX_ROWS + 1 },
      (_, value) => ({ value }),
    );
    const service = new SqlConsoleService({
      executeReadOnlyQuery: vi.fn().mockResolvedValue({
        columns: ["value"],
        rows,
      }),
    });

    await expect(service.execute("SELECT value FROM values", [])).resolves.toMatchObject({
      rowCount: SQL_CONSOLE_MAX_ROWS + 1,
      truncated: true,
      rows: rows.slice(0, SQL_CONSOLE_MAX_ROWS),
    });
  });
});
