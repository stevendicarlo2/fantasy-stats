import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { SqlQueryGenerationUpdate } from "@/application/ports/sql-query-generator";

import {
  CopilotCliSqlQueryGenerator,
  executeCommand,
} from "./copilot-cli-sql-query-generator";

const execFileAsync = promisify(execFile);

describe("CopilotCliSqlQueryGenerator", () => {
  it("checks whether the local Copilot executable can start", async () => {
    const availableExecutor = vi.fn().mockResolvedValue({
      stdout: "GitHub Copilot CLI 1.0.84",
      stderr: "",
    });
    const unavailableExecutor = vi
      .fn()
      .mockRejectedValue(new Error("missing"));

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        availableExecutor,
      ).checkAvailability(),
    ).resolves.toBe(true);
    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        unavailableExecutor,
      ).checkAvailability(),
    ).resolves.toBe(false);

    expect(availableExecutor).toHaveBeenCalledWith(
      "copilot",
      ["--version"],
      expect.objectContaining({
        cwd: "/application",
        timeout: 5_000,
      }),
    );
  });

  it("runs Copilot with repository read access and validates its JSON response", async () => {
    const response = {
      response: "I generated a query for the 2017 season.",
      statement: "SELECT year FROM seasons WHERE year = ?",
      parameters: [2017],
    };
    const executor = vi.fn().mockResolvedValue({
      stdout: [
        JSON.stringify({
          type: "assistant.message_delta",
          data: { deltaContent: JSON.stringify(response) },
        }),
        "",
      ].join("\n"),
      stderr: "",
    });
    const generator = new CopilotCliSqlQueryGenerator(
      "/application",
      executor,
    );

    await expect(
      generator.generate("Show the 2017 season"),
    ).resolves.toEqual(response);

    expect(executor).toHaveBeenCalledOnce();
    const [command, args, options] = executor.mock.calls[0];
    expect(command).toBe("copilot");
    expect(args).toContain("--available-tools=view,glob");
    expect(args).toContain("--allow-tool=read");
    expect(args).toContain(
      "--deny-tool=shell,write,web_fetch,web_search,task",
    );
    expect(args).toContain("--disallow-temp-dir");
    expect(args).toContain("--disable-builtin-mcps");
    expect(args).toContain("--no-custom-instructions");
    expect(args).toContain("--output-format");
    expect(args).toContain("--stream");
    expect(args.at(-1)).toContain("docs/sql-console.md");
    expect(args.at(-1)).toContain("migrations/");
    expect(args.at(-1)).toContain("Show the 2017 season");
    expect(options).toMatchObject({
      cwd: "/application",
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    expect(options.env).not.toBe(process.env);
  });

  it("does not expose application secrets to the subprocess", async () => {
    const probeName = "FANTASY_STATS_COPILOT_SECRET_PROBE";
    const originalProbe = process.env[probeName];
    process.env[probeName] = "must-not-be-inherited";

    const executor = async (
      _command: string,
      _args: string[],
      options: {
        cwd: string;
        timeout: number;
        maxBuffer: number;
        env: NodeJS.ProcessEnv;
      },
    ) => {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [
          "-e",
          `process.stdout.write(JSON.stringify({
            response: "I generated a query.",
            statement: process.env.${probeName} ?? "SELECT 1",
            parameters: [],
          }).split("").map((deltaContent) => JSON.stringify({
            type: "assistant.message_delta",
            data: { deltaContent },
          }) + "\\n").join(""))`,
        ],
        {
          ...options,
          encoding: "utf8",
        },
      );

      return {
        stdout: String(stdout),
        stderr: String(stderr),
      };
    };

    try {
      const generator = new CopilotCliSqlQueryGenerator(
        process.cwd(),
        executor,
      );

      await expect(generator.generate("Show data")).resolves.toEqual({
        response: "I generated a query.",
        statement: "SELECT 1",
        parameters: [],
      });
    } finally {
      if (originalProbe === undefined) {
        delete process.env[probeName];
      } else {
        process.env[probeName] = originalProbe;
      }
    }
  });

  it("rejects malformed or unsafe output shapes", async () => {
    const malformed = new CopilotCliSqlQueryGenerator(
      "/application",
      vi.fn().mockResolvedValue({ stdout: "```json\n{}\n```", stderr: "" }),
    );
    const invalidParameters = new CopilotCliSqlQueryGenerator(
      "/application",
      vi.fn().mockResolvedValue({
        stdout: `${JSON.stringify({
          type: "assistant.message_delta",
          data: {
            deltaContent: JSON.stringify({
              response: "I generated a query.",
              statement: "SELECT ?",
              parameters: [true],
            }),
          },
        })}\n`,
        stderr: "",
      }),
    );

    await expect(malformed.generate("Show data")).rejects.toThrow(
      "Copilot returned an invalid SQL query response",
    );
    await expect(invalidParameters.generate("Show data")).rejects.toThrow(
      "Copilot returned an invalid SQL query response",
    );
  });

  it("streams only the conversational response from Copilot JSON", async () => {
    const response = {
      response: "I generated a useful query.",
      statement: "SELECT 1",
      parameters: [],
    };
    const executor = vi.fn(
      async (
        _command: string,
        _args: string[],
        options: {
          onStdout?: (chunk: string) => void;
        },
      ) => {
        for (const deltaContent of [
          '{"response":"I generated ',
          'a useful query.","statement":"SELECT 1","parameters":[]}',
        ]) {
          options.onStdout?.(
            `${JSON.stringify({
              type: "assistant.message_delta",
              data: { deltaContent },
            })}\n`,
          );
        }

        return { stdout: "", stderr: "" };
      },
    );
    const updates: SqlQueryGenerationUpdate[] = [];

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        executor,
      ).generate("Show data", (update) => updates.push(update)),
    ).resolves.toEqual(response);
    expect(
      updates
        .filter(
          (
            update,
          ): update is Extract<
            SqlQueryGenerationUpdate,
            { type: "response-delta" }
          > => update.type === "response-delta",
        )
        .map((update) => update.delta)
        .join(""),
    ).toBe(response.response);
  });

  it("streams sanitized assistant and repository-read progress", async () => {
    const response = {
      response: "I generated a query.",
      statement: "SELECT 1",
      parameters: [],
    };
    const stdout = [
      {
        type: "assistant.message",
        data: {
          content: "I’ll inspect the documented schema first.",
        },
      },
      {
        type: "tool.execution_start",
        data: {
          toolName: "view",
          arguments: {
            path: "/application/docs/sql-console.md",
          },
        },
      },
      {
        type: "tool.execution_start",
        data: {
          toolName: "glob",
          arguments: { pattern: "migrations/*.sql" },
        },
      },
      {
        type: "assistant.message",
        data: {
          phase: "final_answer",
          content: JSON.stringify(response),
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const updates: SqlQueryGenerationUpdate[] = [];

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        vi.fn().mockResolvedValue({ stdout, stderr: "" }),
      ).generate("Show data", (update) => updates.push(update)),
    ).resolves.toEqual(response);
    expect(updates).toEqual([
      {
        type: "progress",
        message: "I’ll inspect the documented schema first.",
      },
      {
        type: "progress",
        message: "Reading docs/sql-console.md",
      },
      {
        type: "progress",
        message: "Finding migrations/*.sql",
      },
    ]);
  });

  it("allows protocol events larger than the final response limit", async () => {
    const response = {
      response: "I generated a query.",
      statement: "SELECT year FROM seasons ORDER BY year DESC",
      parameters: [],
    };
    const executor = vi.fn(
      async (
        _command: string,
        _args: string[],
        options: {
          maxBuffer: number;
          onStdout?: (chunk: string) => void;
        },
      ) => {
        const toolEvent = `${JSON.stringify({
          type: "tool.execution_complete",
          data: { result: "x".repeat(70 * 1024) },
        })}\n`;
        const responseEvent = `${JSON.stringify({
          type: "assistant.message_delta",
          data: { deltaContent: JSON.stringify(response) },
        })}\n`;

        expect(Buffer.byteLength(toolEvent)).toBeGreaterThan(64 * 1024);
        expect(options.maxBuffer).toBeGreaterThan(
          Buffer.byteLength(toolEvent),
        );
        options.onStdout?.(toolEvent);
        options.onStdout?.(responseEvent);

        return {
          stdout: toolEvent + responseEvent,
          stderr: "",
        };
      },
    );

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        executor,
      ).generate("List seasons"),
    ).resolves.toEqual(response);
  });

  it("parses the final answer separately from earlier assistant messages", async () => {
    const response = {
      response: "I generated a query that lists imported seasons.",
      statement: "SELECT year FROM seasons ORDER BY year DESC",
      parameters: [],
    };
    const stdout = [
      {
        type: "assistant.message_delta",
        data: {
          deltaContent:
            "I'll inspect the schema before generating the query.",
        },
      },
      {
        type: "assistant.message",
        data: {
          phase: "final_answer",
          content: JSON.stringify(response),
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        vi.fn().mockResolvedValue({ stdout, stderr: "" }),
      ).generate("List seasons"),
    ).resolves.toEqual(response);
  });

  it("preserves multibyte UTF-8 characters split across output chunks", async () => {
    const streamed: string[] = [];
    const result = await executeCommand(
      process.execPath,
      [
        "-e",
        `
const output = Buffer.from("é漢");
process.stdout.write(output.subarray(0, 1));
setTimeout(() => {
  process.stdout.write(output.subarray(1, 3));
  setTimeout(() => process.stdout.write(output.subarray(3)), 5);
}, 5);
        `.trim(),
      ],
      {
        cwd: process.cwd(),
        timeout: 5_000,
        maxBuffer: 1_024,
        env: process.env,
        onStdout: (chunk) => streamed.push(chunk),
      },
    );

    expect(result.stdout).toBe("é漢");
    expect(streamed.join("")).toBe("é漢");
  });

  it("terminates the subprocess when generation is aborted", async () => {
    const controller = new AbortController();
    const command = executeCommand(
      process.execPath,
      ["-e", "setTimeout(() => {}, 10_000)"],
      {
        cwd: process.cwd(),
        timeout: 20_000,
        maxBuffer: 1_024,
        env: process.env,
        signal: controller.signal,
      },
    );

    controller.abort();

    await expect(command).rejects.toMatchObject({
      code: "ABORT_ERR",
      name: "AbortError",
    });
  });

  it("passes cancellation to the command executor", async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const executor = vi.fn().mockRejectedValue(abortError);

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        executor,
      ).generate("Show data", undefined, controller.signal),
    ).rejects.toBe(abortError);
    expect(executor).toHaveBeenCalledWith(
      "copilot",
      expect.any(Array),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("reports missing and timed-out CLI processes safely", async () => {
    const missingError = Object.assign(new Error("missing"), {
      code: "ENOENT",
    });
    const timeoutError = Object.assign(new Error("timeout"), {
      killed: true,
    });

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        vi.fn().mockRejectedValue(missingError),
      ).generate("Show data"),
    ).rejects.toThrow(
      "Copilot CLI is not installed or is not available on PATH",
    );
    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        vi.fn().mockRejectedValue(timeoutError),
      ).generate("Show data"),
    ).rejects.toThrow(
      "Copilot did not finish generating the query within 60 seconds",
    );

    await expect(
      new CopilotCliSqlQueryGenerator(
        "/application",
        vi.fn().mockRejectedValue(
          Object.assign(new Error("too much output"), {
            code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
          }),
        ),
      ).generate("Show data"),
    ).rejects.toThrow(
      "Copilot produced too much output while generating the query",
    );
  });
});
