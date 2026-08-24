# Canonical Domain Model

The initial domain model represents application-owned fantasy league data
without exposing ESPN payload shapes or database-provider result types.

## Imported records

- `League` identifies the historical league.
- `Season` records its year, team count, and regular-season week boundaries.
- `Franchise` has a stable application UUID across seasons and an optional
  owner name.
- `FranchiseName` records the set of known names for a franchise without
  effective dates.
- `Matchup` records its week, phase, and two participating franchises.
- `ImportedMatchupScore` records one final imported score for each franchise in
  a matchup.
- `SourceMapping` associates canonical UUIDs with provider identifiers.

`SeasonImportSnapshot` is the canonical source-adapter output for a season. Its
boundary schema rejects malformed and internally inconsistent snapshots,
including team-count mismatches, missing franchise names, missing matchup
scores, ambiguous provider mappings, and references to unknown canonical
records.

## Manual and operational records

- `MatchupOverride` stores a two-decimal additive score adjustment and a
  required human-readable reason. It does not modify imported scores.
- `ImportRun` records import or refresh status and requires explicit failure
  details for failed runs.

## Precision and identifiers

Canonical entity IDs are UUID strings. Imported scores and manual adjustments
must use no more than two decimal places. Provider IDs remain isolated in
source mappings and never replace canonical IDs.

This model does not yet define SQL tables, persistence method signatures, or
ESPN payload schemas. Those belong to later database and source-adapter
implementation steps.
