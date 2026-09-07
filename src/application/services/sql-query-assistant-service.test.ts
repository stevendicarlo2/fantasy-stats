import { describe, expect, it, vi } from "vitest";

import {
  SQL_QUERY_REQUEST_MAX_LENGTH,
  SqlQueryAssistantService,
} from "./sql-query-assistant-service";

describe("SqlQueryAssistantService", () => {
  it("checks generator availability once per service instance", async () => {
    const generator = {
      checkAvailability: vi.fn().mockResolvedValue(true),
      generate: vi.fn(),
    };
    const service = new SqlQueryAssistantService(generator);

    await expect(service.isAvailable()).resolves.toBe(true);
    await expect(service.isAvailable()).resolves.toBe(true);
    expect(generator.checkAvailability).toHaveBeenCalledOnce();
  });

  it("trims the request and normalizes the generated query", async () => {
    const generator = {
      checkAvailability: vi.fn(),
      generate: vi.fn().mockResolvedValue({
        statement: "  SELECT year FROM seasons  ",
        parameters: [],
      }),
    };
    const service = new SqlQueryAssistantService(generator);

    await expect(
      service.generate("  Show imported seasons  "),
    ).resolves.toEqual({
      statement: "SELECT year FROM seasons",
      parameters: [],
    });
    expect(generator.generate).toHaveBeenCalledWith(
      "Show imported seasons",
    );
  });

  it("rejects blank and oversized requests before invoking Copilot", async () => {
    const generator = {
      checkAvailability: vi.fn(),
      generate: vi.fn(),
    };
    const service = new SqlQueryAssistantService(generator);

    await expect(service.generate(" ")).rejects.toThrow(
      "Describe the data you want to query",
    );
    await expect(
      service.generate("x".repeat(SQL_QUERY_REQUEST_MAX_LENGTH + 1)),
    ).rejects.toThrow(
      `Query requests must not exceed ${SQL_QUERY_REQUEST_MAX_LENGTH} characters`,
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("rejects generated output that exceeds console limits", async () => {
    const service = new SqlQueryAssistantService({
      checkAvailability: vi.fn(),
      generate: vi.fn().mockResolvedValue({
        statement: "SELECT 1",
        parameters: Array.from({ length: 51 }, () => null),
      }),
    });

    await expect(service.generate("Return a value")).rejects.toThrow(
      "SQL queries support at most 50 parameters",
    );
  });
});
