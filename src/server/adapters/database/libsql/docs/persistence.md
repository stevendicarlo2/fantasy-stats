# libSQL Persistence

The libSQL adapter implements the application-owned `DatabaseProvider`
interface for both local SQLite-compatible files and remote Turso databases.
All SQL values are parameterized; libSQL client and result types remain inside
the adapter.

## Initial schema

Migration `0001_initial_schema.sql` creates:

| Table | Purpose |
| --- | --- |
| `leagues` | Canonical league identity |
| `seasons` | Year, team count, and regular-season boundaries |
| `franchises` | Stable league-level franchise identity |
| `season_franchises` | Franchises participating in each season |
| `franchise_names` | Known names for each franchise |
| `matchups` | Weekly head-to-head schedule and phase |
| `imported_matchup_scores` | Latest imported final scores |
| `source_mappings` | Provider IDs mapped to canonical UUIDs |
| `import_runs` | Import and refresh audit state |
| `matchup_overrides` | Manual additive score adjustments |

The initial application supports one league, so a season year is unique across
the database. Franchise names accumulate as known names rather than being
deleted during a refresh.

## Import transactions

`startImportRun` records an attempt before source retrieval or persistence.

`commitSeasonImport` validates the complete canonical snapshot and applies it in
one write transaction. Ordered writes are sent through libSQL transaction
batches to avoid a separate database round trip for every imported record,
while validation queries remain explicit checkpoints inside the same
transaction. It:

- Upserts canonical league, season, franchise, matchup, score, and mapping data
- Replaces season participation with the latest snapshot
- Removes stale imported matchups only when no manual override targets them
- Preserves manual overrides across imported score corrections
- Rejects refreshes that would remove or invalidate an existing override
- Marks the import run successful only after every write succeeds

Any failure rolls back the entire snapshot update. `failImportRun` separately
marks a running audit record failed with explicit error details.

## Read validation

Rows returned by libSQL are validated with application-owned Zod schemas before
they leave the adapter. Reconstructed season snapshots must pass the same
cross-record consistency schema used by source adapters.

## Advanced SQL

The arbitrary SQL path accepts a single `SELECT`, `WITH`, or `EXPLAIN`
statement. It rejects mutating keywords before execution and also runs the
statement inside a libSQL read transaction.

Query results are mapped to `string`, `number`, or `null`. Unsafe large
integers become strings, while binary values are rejected explicitly.

## Provider construction

- `local-database.ts` creates a provider for a local `file:` URL.
- `turso-database.ts` creates a remote provider from validated
  `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` values.
