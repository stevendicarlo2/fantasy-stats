# Matchup Score Adjustments

Manual corrections remain separate from imported ESPN scores. An adjustment
targets one franchise in one matchup and stores:

- An additive score adjustment with at most two decimal places
- A required human-readable reason

The effective score is:

```text
imported ESPN score + manual adjustment
```

Effective scores feed the existing NP and ANP SQL views immediately. A season
refresh updates imported scores without deleting its manual adjustments.

## Web workflow

Open an imported season and select **Manage score adjustments**.
The adjustment-page season selector lists every imported season and navigates
directly to that season's adjustments.

1. Choose a week, matchup, and franchise score.
2. Enter only the amount to add, such as `-1.25` or `2.00`.
3. Enter the reason for the correction.
4. Save the adjustment.

Saving the same matchup and franchise updates the existing adjustment. Delete
removes only the manual adjustment and restores the effective score to the
current imported ESPN score.

Adjustments may affect weekly score rank, head-to-head results, NP, ANP, and
regular-season qualification standings. Imported ESPN rows are never edited by
this workflow.
