// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runSqlConsoleAction } from "../actions";
import { SqlConsole } from "./sql-console";

vi.mock("../actions", () => ({
  runSqlConsoleAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SqlConsole Copilot generation", () => {
  it("shows the submitted question and live response before restoring the input", async () => {
    let finishStream:
      | ((value: {
          done: boolean;
          value: Uint8Array;
        }) => void)
      | undefined;
    const encoder = new TextEncoder();
    const reads = [
      Promise.resolve({
        done: false,
        value: encoder.encode(
          [
            {
              type: "progress",
              message: "Reading docs/sql-console.md",
            },
            {
              type: "progress",
              message: "Finding migrations/*.sql",
            },
            {
              type: "response-delta",
              delta: "I am building",
            },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
        ),
      }),
      new Promise<{
        done: boolean;
        value: Uint8Array;
      }>((resolve) => {
        finishStream = resolve;
      }),
      Promise.resolve({
        done: true,
        value: new Uint8Array(),
      }),
    ];
    const read = vi.fn(() => reads.shift());

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({ read }),
        },
      }),
    );

    const view = render(<SqlConsole copilotAvailable />);
    const request = view.getByLabelText(
      "Ask Copilot for a query",
    );
    fireEvent.change(request, {
      target: { value: "Show the latest season" },
    });
    fireEvent.click(
      view.getByRole("button", { name: "Generate query" }),
    );

    expect(
      view.queryByLabelText("Ask Copilot for a query"),
    ).toBeNull();
    expect(view.getByText("Show the latest season")).toBeTruthy();
    await waitFor(() => {
      expect(view.getByText("I am building")).toBeTruthy();
      expect(
        view.getByText("Reading docs/sql-console.md"),
      ).toBeTruthy();
      expect(
        view.getByText("Finding migrations/*.sql"),
      ).toBeTruthy();
    });

    await act(async () => {
      finishStream?.({
        done: false,
        value: encoder.encode(
          `${JSON.stringify({
            type: "complete",
            response: "I built a query for the latest season.",
            state: {
              status: "success",
              message: "Query generated. Review or run it below.",
              result: null,
              formattedStatement: null,
              generatedQuery: {
                statement: "SELECT MAX(year) FROM seasons",
                parameters: "[]",
              },
            },
          })}\n`,
        ),
      });
    });

    await waitFor(() => {
      expect(
        view.getByLabelText("Ask Copilot for a query"),
      ).toBeTruthy();
      expect(
        view.getByText("I built a query for the latest season."),
      ).toBeTruthy();
      expect(
        (
          view.getByLabelText(
            "SQL statement",
          ) as HTMLTextAreaElement
        ).value,
      ).toBe("SELECT MAX(year) FROM seasons");
    });
  });

  it("aborts generation when the console unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          requestSignal = init?.signal ?? undefined;

          return new Promise((_resolve, reject) => {
            requestSignal?.addEventListener(
              "abort",
              () =>
                reject(
                  Object.assign(new Error("aborted"), {
                    name: "AbortError",
                  }),
                ),
              { once: true },
            );
          });
        },
      ),
    );

    const view = render(<SqlConsole copilotAvailable />);
    fireEvent.change(
      view.getByLabelText("Ask Copilot for a query"),
      { target: { value: "Show the latest season" } },
    );
    fireEvent.click(
      view.getByRole("button", { name: "Generate query" }),
    );

    expect(requestSignal?.aborted).toBe(false);
    view.unmount();
    expect(requestSignal?.aborted).toBe(true);
  });

  it("reports an error when the stream ends without completion", async () => {
    const encoder = new TextEncoder();
    const reads = [
      Promise.resolve({
        done: false,
        value: encoder.encode(
          `${JSON.stringify({
            type: "response-delta",
            delta: "I only sent part of the response.",
          })}\n`,
        ),
      }),
      Promise.resolve({
        done: true,
        value: new Uint8Array(),
      }),
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(() => reads.shift()),
          }),
        },
      }),
    );

    const view = render(<SqlConsole copilotAvailable />);
    fireEvent.change(
      view.getByLabelText("Ask Copilot for a query"),
      { target: { value: "Show the latest season" } },
    );
    fireEvent.click(
      view.getByRole("button", { name: "Generate query" }),
    );

    await waitFor(() => {
      expect(
        view.getByText(
          "Copilot response stream ended before completion",
        ),
      ).toBeTruthy();
      expect(
        view.getByLabelText("Ask Copilot for a query"),
      ).toBeTruthy();
    });
  });

  describe("SqlConsole manual queries", () => {
    it("replaces a submitted statement with its formatted version", async () => {
      vi.mocked(runSqlConsoleAction).mockResolvedValue({
        status: "success",
        message: "Query returned 0 rows",
        result: {
          columns: ["year"],
          rows: [],
          rowCount: 0,
          truncated: false,
        },
        generatedQuery: null,
        formattedStatement: "SELECT\n  year\nFROM\n  seasons",
      });

      const view = render(<SqlConsole copilotAvailable={false} />);
      fireEvent.change(view.getByLabelText("SQL statement"), {
        target: { value: "select year from seasons" },
      });
      fireEvent.submit(
        view.getByLabelText("SQL statement").closest("form")!,
      );

      await waitFor(() => {
        expect(
          (view.getByLabelText("SQL statement") as HTMLTextAreaElement)
            .value,
        ).toBe("SELECT\n  year\nFROM\n  seasons");
      });
    });

    it("preserves edits made while a submitted query is running", async () => {
      let resolveAction:
        | ((
            state: Awaited<
              ReturnType<typeof runSqlConsoleAction>
            >,
          ) => void)
        | undefined;
      const actionResult = new Promise<
        Awaited<ReturnType<typeof runSqlConsoleAction>>
      >((resolve) => {
        resolveAction = resolve;
      });
      vi.mocked(runSqlConsoleAction).mockReturnValue(actionResult);

      const view = render(<SqlConsole copilotAvailable={false} />);
      const statement = view.getByLabelText(
        "SQL statement",
      ) as HTMLTextAreaElement;
      fireEvent.change(statement, {
        target: { value: "select year from seasons" },
      });
      fireEvent.submit(statement.closest("form")!);
      fireEvent.change(statement, {
        target: {
          value: "select year, display_name from seasons",
        },
      });

      await act(async () => {
        resolveAction?.({
          status: "success",
          message: "Query returned 0 rows",
          result: {
            columns: ["year"],
            rows: [],
            rowCount: 0,
            truncated: false,
          },
          generatedQuery: null,
          formattedStatement: "SELECT\n  year\nFROM\n  seasons",
        });
        await actionResult;
      });

      expect(statement.value).toBe(
        "select year, display_name from seasons",
      );
    });
  });
});
