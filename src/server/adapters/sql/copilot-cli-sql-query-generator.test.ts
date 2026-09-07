import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { CopilotCliSqlQueryGenerator } from "./copilot-cli-sql-query-generator";

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
    const executor = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        statement: "SELECT year FROM seasons WHERE year = ?",
        parameters: [2017],
      }),
      stderr: "",
    });
    const generator = new CopilotCliSqlQueryGenerator(
      "/application",
      executor,
    );

    await expect(
      generator.generate("Show the 2017 season"),
    ).resolves.toEqual({
      statement: "SELECT year FROM seasons WHERE year = ?",
      parameters: [2017],
    });

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
    expect(args.at(-1)).toContain("docs/sql-console.md");
    expect(args.at(-1)).toContain("migrations/");
    expect(args.at(-1)).toContain("Show the 2017 season");
    expect(options).toMatchObject({
      cwd: "/application",
      timeout: 60_000,
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
            statement: process.env.${probeName} ?? "SELECT 1",
            parameters: [],
          }))`,
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
        stdout: JSON.stringify({
          statement: "SELECT ?",
          parameters: [true],
        }),
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
  });
});
