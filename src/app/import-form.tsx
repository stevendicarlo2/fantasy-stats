"use client";

import { useActionState } from "react";

import { runSeasonAction } from "./actions";
import { initialImportActionState } from "./import-action-logic";

interface ImportFormProps {
  years: number[];
}

export function ImportForm({ years }: ImportFormProps) {
  const [state, formAction, pending] = useActionState(
    runSeasonAction,
    initialImportActionState,
  );

  return (
    <form action={formAction} className="import-form">
      <label htmlFor="season-year">Season</label>
      <select id="season-year" name="year" defaultValue={years[0]} required>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <div className="button-row">
        <button
          type="submit"
          name="operation"
          value="import"
          disabled={pending}
        >
          {pending ? "Working..." : "Import season"}
        </button>
        <button
          type="submit"
          name="operation"
          value="refresh"
          className="secondary"
          disabled={pending}
        >
          Refresh season
        </button>
      </div>
      {state.message ? (
        <p
          className={`action-message ${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
