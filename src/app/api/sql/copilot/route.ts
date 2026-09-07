import { SafeOperationalError } from "@/application/errors";
import {
  SQL_QUERY_REQUEST_MAX_LENGTH,
} from "@/application/services/sql-query-assistant-service";
import {
  formatResultMessage,
  type SqlConsoleActionState,
} from "@/app/sql-console-action-logic";
import { getWebRuntime } from "@/server/runtime/web-runtime";

export const runtime = "nodejs";

type CopilotRequest = {
  request: string;
  runGeneratedQuery: boolean;
};

function isCopilotRequest(value: unknown): value is CopilotRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    typeof value.request === "string" &&
    value.request.length <= SQL_QUERY_REQUEST_MAX_LENGTH &&
    "runGeneratedQuery" in value &&
    typeof value.runGeneratedQuery === "boolean"
  );
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (origin !== requestUrl.origin) {
    return Response.json(
      { message: "Cross-origin Copilot requests are not allowed" },
      { status: 403 },
    );
  }

  if (contentType !== "application/json") {
    return Response.json(
      { message: "Copilot requests must use application/json" },
      { status: 415 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Copilot request must be valid JSON" },
      { status: 400 },
    );
  }

  if (!isCopilotRequest(body)) {
    return Response.json(
      { message: "Copilot request is invalid" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const generationAbortController = new AbortController();
  let streamClosed = false;
  const abortGeneration = () => generationAbortController.abort();
  request.signal.addEventListener("abort", abortGeneration, {
    once: true,
  });
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (
          streamClosed ||
          generationAbortController.signal.aborted
        ) {
          return;
        }

        controller.enqueue(
          encoder.encode(`${JSON.stringify(event)}\n`),
        );
      };

      try {
        generationAbortController.signal.throwIfAborted();
        const runtime = await getWebRuntime();
        const query = await runtime.sqlQueryAssistantService.generate(
          body.request,
          send,
          generationAbortController.signal,
        );
        generationAbortController.signal.throwIfAborted();
        let state: SqlConsoleActionState = {
          status: "success",
          message: "Query generated. Review or run it below.",
          result: null,
          generatedQuery: {
            statement: query.statement,
            parameters: JSON.stringify(query.parameters),
          },
          formattedStatement: null,
        };

        if (body.runGeneratedQuery) {
          generationAbortController.signal.throwIfAborted();

          try {
            const result = await runtime.sqlConsoleService.execute(
              query.statement,
              query.parameters,
            );
            state = {
              ...state,
              message: `Query generated. ${formatResultMessage(result)}`,
              result,
            };
          } catch (error) {
            state = {
              ...state,
              status: "error",
              message:
                error instanceof SafeOperationalError
                  ? error.message
                  : "The generated SQL query failed unexpectedly",
            };
          }
        }

        send({
          type: "complete",
          response: query.response,
          state,
        });
      } catch (error) {
        if (!generationAbortController.signal.aborted) {
          send({
            type: "error",
            message:
              error instanceof SafeOperationalError
                ? error.message
                : "Copilot query generation failed unexpectedly",
          });
        }
      } finally {
        request.signal.removeEventListener(
          "abort",
          abortGeneration,
        );

        if (!streamClosed) {
          streamClosed = true;
          controller.close();
        }
      }
    },
    cancel() {
      streamClosed = true;
      request.signal.removeEventListener("abort", abortGeneration);
      abortGeneration();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
