"use client";

import { useActionState, useState } from "react";

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

export function SqlConsole() {
  const initialQuery = sqlStarterQueries[0];
  const [statement, setStatement] = useState(initialQuery.statement);
  const [parameters, setParameters] = useState(initialQuery.parameters);
  const [state, formAction, pending] = useActionState(
    async (
      previousState: SqlConsoleActionState,
      formData: FormData,
    ) => {
      const nextState = await runSqlConsoleAction(
        previousState,
        formData,
      );

      if (nextState.generatedQuery) {
        setStatement(nextState.generatedQuery.statement);
        setParameters(nextState.generatedQuery.parameters);
      }

      return nextState;
    },
    initialSqlConsoleActionState,
  );

  function selectStarter(query: SqlStarterQuery) {
    setStatement(query.statement);
    setParameters(query.parameters);
  }

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
        <form action={formAction} className="sql-form">
          <div className="copilot-query-builder">
            <label htmlFor="sql-request">Ask Copilot for a query</label>
            <textarea
              id="sql-request"
              name="request"
              rows={4}
              placeholder="For example: Compare each person's average weekly ANP in 2023 and 2024."
              maxLength={2000}
            />
            <p className="field-help">
              Runs the local Copilot CLI with schema context and no tools. The
              generated SQL still uses this console&apos;s read-only checks.
            </p>
            <div className="button-row">
              <button
                type="submit"
                name="operation"
                value="generate"
                disabled={pending}
              >
                {pending ? "Working..." : "Generate query"}
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
          </div>

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
        {state.message ? (
          <p
            className={`action-message ${state.status}`}
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : (
          <p>Run a query to inspect its results.</p>
        )}

        {state.result ? (
          state.result.columns.length === 0 ? (
            <p>The query returned no columns.</p>
          ) : (
            <div className="table-wrap sql-results">
              <table>
                <thead>
                  <tr>
                    {state.result.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.result.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {state.result?.columns.map((column) => (
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
