import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
});
