"use client";

import { useActionState } from "react";

import {
  initialAdjustmentActionState,
} from "./adjustment-action-logic";
import { runAdjustmentAction } from "./actions";

export interface AdjustmentCandidate {
  matchupId: string;
  franchiseId: string;
  week: number;
  teamLabel: string;
  opponentLabel: string;
  importedScore: number;
  existingAdjustment: number | null;
}

export interface ExistingAdjustment {
  id: string;
  week: number;
  teamLabel: string;
  scoreAdjustment: number;
  reason: string;
}

interface AdjustmentManagerProps {
  seasonYear: number;
  candidates: AdjustmentCandidate[];
  existingAdjustments: ExistingAdjustment[];
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function AdjustmentManager({
  seasonYear,
  candidates,
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
            {candidates.map((candidate) => (
              <option
                key={`${candidate.matchupId}:${candidate.franchiseId}`}
                value={`${candidate.matchupId}:${candidate.franchiseId}`}
              >
                Week {candidate.week}: {candidate.teamLabel} vs.{" "}
                {candidate.opponentLabel} (ESPN{" "}
                {candidate.importedScore.toFixed(2)}
                {candidate.existingAdjustment === null
                  ? ""
                  : `, current ${formatSigned(candidate.existingAdjustment)}`}
                )
              </option>
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
                    Week {adjustment.week}: {adjustment.teamLabel}
                  </strong>
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
