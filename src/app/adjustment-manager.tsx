"use client";

import { useActionState } from "react";

import {
  initialAdjustmentActionState,
} from "./adjustment-action-logic";
import { runAdjustmentAction } from "./actions";

export interface AdjustmentCandidate {
  franchiseId: string;
  teamLabel: string;
  importedScore: number;
  existingAdjustment: number | null;
}

export interface AdjustmentMatchup {
  id: string;
  week: number;
  label: string;
  home: AdjustmentCandidate;
  away: AdjustmentCandidate | null;
}

export interface ExistingAdjustment {
  id: string;
  week: number;
  matchupLabel: string;
  teamLabel: string;
  scoreAdjustment: number;
  reason: string;
}

interface AdjustmentManagerProps {
  seasonYear: number;
  matchups: AdjustmentMatchup[];
  existingAdjustments: ExistingAdjustment[];
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function AdjustmentManager({
  seasonYear,
  matchups,
  existingAdjustments,
}: AdjustmentManagerProps) {
  const [state, formAction, pending] = useActionState(
    runAdjustmentAction,
    initialAdjustmentActionState,
  );

  return (
    <div className="adjustment-layout">
      <section className="panel">
        <p className="panel-kicker">Additive correction</p>
        <h2>Add or edit an adjustment</h2>
        <p>
          Enter only the amount to add to the imported ESPN score. Saving the
          same matchup and team updates its existing correction.
        </p>
        <form action={formAction} className="adjustment-form">
          <input type="hidden" name="operation" value="save" />
          <input type="hidden" name="seasonYear" value={seasonYear} />

          <label htmlFor="adjustment-target">Matchup score</label>
          <select id="adjustment-target" name="target" required>
            {matchups.map((matchup) => (
              <optgroup
                key={matchup.id}
                label={`Week ${matchup.week}: ${matchup.label}`}
              >
                {[matchup.home, matchup.away]
                  .filter(
                    (candidate): candidate is AdjustmentCandidate =>
                      candidate !== null,
                  )
                  .map((candidate) => (
                    <option
                      key={candidate.franchiseId}
                      value={`${matchup.id}:${candidate.franchiseId}`}
                    >
                      {candidate.teamLabel} (ESPN{" "}
                      {candidate.importedScore.toFixed(2)}
                      {candidate.existingAdjustment === null
                        ? ""
                        : `, current ${formatSigned(candidate.existingAdjustment)}`}
                      )
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>

          <label htmlFor="score-adjustment">Score adjustment</label>
          <input
            id="score-adjustment"
            name="scoreAdjustment"
            type="number"
            step="0.01"
            placeholder="-1.25"
            required
          />

          <label htmlFor="adjustment-reason">Reason</label>
          <textarea
            id="adjustment-reason"
            name="reason"
            rows={3}
            maxLength={500}
            required
          />

          <button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save adjustment"}
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="panel-kicker">Manual data</p>
        <h2>Current adjustments</h2>
        {existingAdjustments.length === 0 ? (
          <p>No manual score adjustments exist for this season.</p>
        ) : (
          <div className="adjustment-list">
            {existingAdjustments.map((adjustment) => (
              <article className="adjustment-item" key={adjustment.id}>
                <div>
                  <strong>
                    Week {adjustment.week}: {adjustment.matchupLabel}
                  </strong>
                  <span className="adjustment-team">
                    {adjustment.teamLabel}
                  </span>
                  <span>{formatSigned(adjustment.scoreAdjustment)}</span>
                  <p>{adjustment.reason}</p>
                </div>
                <form action={formAction}>
                  <input type="hidden" name="operation" value="delete" />
                  <input
                    type="hidden"
                    name="seasonYear"
                    value={seasonYear}
                  />
                  <input
                    type="hidden"
                    name="matchupOverrideId"
                    value={adjustment.id}
                  />
                  <button
                    className="danger secondary"
                    type="submit"
                    disabled={pending}
                  >
                    Delete
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}

        {state.message ? (
          <p
            className={`action-message ${state.status}`}
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
