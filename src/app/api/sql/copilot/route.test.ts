import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/runtime/web-runtime", () => ({
  getWebRuntime: vi.fn(),
}));

import { getWebRuntime } from "@/server/runtime/web-runtime";
import { POST } from "./route";

describe("POST /api/sql/copilot", () => {
  it("rejects cross-origin requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/sql/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({
          request: "Show data",
          runGeneratedQuery: false,
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Cross-origin Copilot requests are not allowed",
    });
  });

  it("requires an application/json request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/sql/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          request: "Show data",
          runGeneratedQuery: false,
        }),
      }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: "Copilot requests must use application/json",
    });
  });

  it("streams generated SQL execution errors to the client", async () => {
    vi.mocked(getWebRuntime).mockResolvedValue({
      sqlQueryAssistantService: {
        generate: vi.fn().mockResolvedValue({
          response: "I generated a waiver query.",
          statement: "SELECT missing_column FROM fantasy_transactions",
          parameters: [],
        }),
      },
      sqlConsoleService: {
        execute: vi
          .fn()
          .mockRejectedValue(
            new Error("no such column: missing_column"),
          ),
      },
    } as unknown as Awaited<ReturnType<typeof getWebRuntime>>);
    const response = await POST(
      new Request("http://localhost/api/sql/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({
          request: "Show Steven's waiver claims",
          runGeneratedQuery: true,
        }),
      }),
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "query-running",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "complete",
        state: expect.objectContaining({
          status: "error",
          message: "no such column: missing_column",
        }),
      }),
    );
  });
});
