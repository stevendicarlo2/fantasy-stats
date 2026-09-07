"use client";

import {
  type FormEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  initialSqlConsoleActionState,
  type SqlConsoleActionState,
} from "../sql-console-action-logic";
import {
  sqlStarterQueries,
  type SqlStarterQuery,
} from "../sql-console-starters";
import { runSqlConsoleAction } from "../actions";

function formatCell(value: string | number | null) {
  return value === null ? "NULL" : String(value);
}

interface SqlConsoleProps {
  copilotAvailable: boolean;
}

export function SqlConsole({ copilotAvailable }: SqlConsoleProps) {
  const initialQuery = sqlStarterQueries[0];
  const [statement, setStatement] = useState(initialQuery.statement);
  const [parameters, setParameters] = useState(initialQuery.parameters);
  const [request, setRequest] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState("");
  const [copilotProgress, setCopilotProgress] = useState<string[]>(
    [],
  );
  const [copilotResponse, setCopilotResponse] = useState("");
  const [copilotState, setCopilotState] =
    useState<SqlConsoleActionState | null>(null);
  const [copilotPending, setCopilotPending] = useState(false);
  const generationAbortController = useRef<AbortController | null>(
    null,
  );
  const [state, formAction, sqlPending] = useActionState(
    async (
      previousState: SqlConsoleActionState,
      formData: FormData,
    ) => {
      setCopilotState(null);
      const submittedStatement = formData.get("statement");
      const nextState = await runSqlConsoleAction(
        previousState,
        formData,
      );

      if (nextState.generatedQuery) {
        setStatement(nextState.generatedQuery.statement);
        setParameters(nextState.generatedQuery.parameters);
      } else if (nextState.formattedStatement) {
        const formattedStatement = nextState.formattedStatement;
        setStatement((currentStatement) =>
          typeof submittedStatement === "string" &&
          currentStatement === submittedStatement
            ? formattedStatement
            : currentStatement,
        );
      }

      return nextState;
    },
    initialSqlConsoleActionState,
  );

  function selectStarter(query: SqlStarterQuery) {
    setStatement(query.statement);
    setParameters(query.parameters);
  }

  useEffect(
    () => () => generationAbortController.current?.abort(),
    [],
  );

  async function generateQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const currentRequest = request.trim();

    if (!currentRequest || copilotPending) {
      return;
    }

    setSubmittedRequest(currentRequest);
    setCopilotProgress(["Starting Copilot..."]);
    setCopilotResponse("");
    setCopilotState(null);
    setCopilotPending(true);
    const abortController = new AbortController();
    generationAbortController.current = abortController;

    try {
      const response = await fetch("/api/sql/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: currentRequest,
          runGeneratedQuery:
            submitter?.value === "generate-and-run",
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const error = (await response.json()) as {
          message?: unknown;
        };
        throw new Error(
          typeof error.message === "string"
            ? error.message
            : "Copilot query generation failed",
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) {
            continue;
          }

          const streamEvent = JSON.parse(line) as {
            type: string;
            delta?: unknown;
            message?: unknown;
            response?: unknown;
            state?: SqlConsoleActionState;
          };

          if (
            streamEvent.type === "progress" &&
            typeof streamEvent.message === "string"
          ) {
            const message = streamEvent.message;
            setCopilotProgress((current) => [
              ...current,
              message,
            ]);
          } else if (
            streamEvent.type === "response-delta" &&
            typeof streamEvent.delta === "string"
          ) {
            setCopilotResponse(
              (current) => current + streamEvent.delta,
            );
          } else if (
            streamEvent.type === "complete" &&
            typeof streamEvent.response === "string" &&
            streamEvent.state
          ) {
            setCopilotResponse(streamEvent.response);
            setCopilotState(streamEvent.state);
            completed = true;

            if (streamEvent.state.generatedQuery) {
              setStatement(
                streamEvent.state.generatedQuery.statement,
              );
              setParameters(
                streamEvent.state.generatedQuery.parameters,
              );
            }
          } else if (
            streamEvent.type === "error" &&
            typeof streamEvent.message === "string"
          ) {
            throw new Error(streamEvent.message);
          }
        }

        if (done) {
          break;
        }
      }

      if (!completed) {
        throw new Error(
          "Copilot response stream ended before completion",
        );
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      setCopilotState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Copilot query generation failed unexpectedly",
        result: null,
        generatedQuery: null,
        formattedStatement: null,
      });
    } finally {
      if (generationAbortController.current === abortController) {
        generationAbortController.current = null;
        setCopilotPending(false);
      }
    }
  }

  const displayedState = copilotState ?? state;
  const pending = copilotPending || sqlPending;

  return (
    <div className="sql-console-layout">
      <aside className="panel starter-panel">
        <p className="panel-kicker">Examples</p>
        <h2>Starter queries</h2>
        <p>
          Load a query, edit it freely, then run it against the selected
          persistent database.
        </p>
        <div className="starter-list">
          {sqlStarterQueries.map((query) => (
            <button
              className="secondary"
              type="button"
              key={query.id}
              onClick={() => selectStarter(query)}
            >
              {query.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="panel sql-editor-panel">
        <p className="panel-kicker">Advanced exploration</p>
        <h2>Read-only SQL</h2>
        <p>
          Only one <code>SELECT</code>, <code>WITH</code>, or{" "}
          <code>EXPLAIN</code> statement is accepted. Mutation keywords are
          rejected.
        </p>
        {copilotAvailable ? (
          <form
            onSubmit={generateQuery}
            className="copilot-query-builder"
          >
            {copilotPending ? (
              <div className="copilot-question">
                <span>Your question</span>
                <p>{submittedRequest}</p>
              </div>
            ) : (
              <>
                <label htmlFor="sql-request">
                  Ask Copilot for a query
                </label>
                <textarea
                  id="sql-request"
                  name="request"
                  rows={4}
                  placeholder="For example: Compare each person's average weekly ANP in 2023 and 2024."
                  maxLength={2000}
                  value={request}
                  onChange={(event) =>
                    setRequest(event.target.value)
                  }
                  required
                />
                <p className="field-help">
                  Runs the local Copilot CLI with read-only access to this
                  repository&apos;s schema and scoring documentation. The
                  generated SQL still uses this console&apos;s read-only
                  checks.
                </p>
                <div className="button-row">
                  <button
                    type="submit"
                    name="operation"
                    value="generate"
                    disabled={pending}
                  >
                    Generate query
                  </button>
                  <button
                    type="submit"
                    name="operation"
                    value="generate-and-run"
                    className="secondary"
                    disabled={pending}
                  >
                    Generate &amp; run
                  </button>
                </div>
              </>
            )}

            {copilotProgress.length > 0 ? (
              <div className="copilot-progress" aria-live="polite">
                <span>Progress</span>
                <ul>
                  {copilotProgress.map((message, index) => (
                    <li key={`${index}:${message}`}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {copilotResponse ? (
              <div
                className="copilot-response"
                aria-live="polite"
                aria-busy={copilotPending}
              >
                <span>Copilot</span>
                <p>{copilotResponse}</p>
              </div>
            ) : null}
          </form>
        ) : (
          <p className="action-message error">
            Copilot query generation is unavailable. Install and authenticate
            Copilot CLI, then restart the application.
          </p>
        )}

        <form action={formAction} className="sql-form">
          <label htmlFor="sql-statement">SQL statement</label>
          <textarea
            id="sql-statement"
            name="statement"
            className="sql-editor"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            rows={15}
            spellCheck={false}
            required
          />

          <label htmlFor="sql-parameters">Parameters</label>
          <textarea
            id="sql-parameters"
            name="parameters"
            className="parameter-editor"
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
            rows={3}
            spellCheck={false}
            required
          />
          <p className="field-help">
            JSON array matched to <code>?</code> placeholders. Allowed values:
            strings, finite numbers, and null.
          </p>

          <button
            type="submit"
            name="operation"
            value="run"
            disabled={pending}
          >
            {pending ? "Running..." : "Run query"}
          </button>
        </form>
      </section>

      <section className="panel sql-results-panel">
        <p className="panel-kicker">Query output</p>
        <h2>Results</h2>
        {displayedState.message ? (
          <p
            className={`action-message ${displayedState.status}`}
            aria-live="polite"
          >
            {displayedState.message}
          </p>
        ) : (
          <p>Run a query to inspect its results.</p>
        )}

        {displayedState.result ? (
          displayedState.result.columns.length === 0 ? (
            <p>The query returned no columns.</p>
          ) : (
            <div className="table-wrap sql-results">
              <table>
                <thead>
                  <tr>
                    {displayedState.result.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedState.result.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {displayedState.result?.columns.map((column) => (
                        <td key={column}>{formatCell(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
