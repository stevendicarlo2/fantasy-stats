# Storage Providers

Storage is selected explicitly so source ingestion and canonical mapping can be
tested independently of Turso.

## Selection

The season CLI accepts:

```text
--storage=dummy|local|turso
```

Selection precedence is:

1. CLI `--storage`
2. `FANTASY_STATS_STORAGE` in `.env.local`
3. `local`

The web application does not accept dummy storage because its state would be
lost between requests. With no explicit selection it uses local storage.

## Dummy storage

```bash
npm run import-season --year=2017 --storage=dummy
```

Dummy storage keeps canonical snapshots, supplemental datasets, source
mappings, import audits, and matchup overrides in memory for the lifetime of
the process. It does not support arbitrary SQL or the matchup-roster detail
read used by the web UI.

The command prints canonical franchise, matchup, and score counts so ingestion
can be verified without a real database. Nothing is persisted after the
command exits, so a later dummy `refresh-season` command cannot find the prior
import.

## Local storage

```bash
npm run import-season --year=2017
npm run refresh-season --year=2017
```

Local mode is the default. It uses the complete libSQL provider and defaults to the gitignored
`.data/fantasy-stats.db` file. Override the path with:

```bash
npm run import-season --year=2017 --storage=local \
  --database-file=/absolute/path/fantasy-stats.db
```

Local mode persists migrations, canonical data, weekly rosters, players,
drafts, transactions, NFL games, player-game statistics, audits,
synchronization leases, overrides, and scoring views. It is suitable for
development and local inspection but is not the cross-computer source of
truth.

Season rows persist ESPN's configured playoff-team count. Global franchise
name history and explicit season-specific team names are stored independently,
so refreshing one season does not collapse a franchise's historical names.
After upgrading an older database, existing season pages remain available but
omit the playoff boundary and may show unknown team names. Refresh each season
once to populate newly introduced ESPN-owned season configuration and explicit
season names.

For the web dashboard, add the following to `.env.local` and restart the
development server:

```text
FANTASY_STATS_STORAGE=local
FANTASY_STATS_LOCAL_DATABASE_FILE=.data/fantasy-stats.db
```

The database-file setting is optional and defaults to the path shown above.
The dashboard applies migrations during server initialization, lists imported
seasons and recent import runs, shows active work, last successful
synchronization, and the latest dataset error, and provides Refresh all and
per-dataset controls. The top form imports new seasons only. Selected datasets
run in dependency order with live per-dataset progress; core is required for a
new season.
Imported season links show cumulative regular-season ANP qualification
standings and weekly effective-score, NP, head-to-head bonus, and ANP results.
Each matchup links to weekly roster detail with actual and projected fantasy
points. Multi-week matchups expose one roster view per scoring period.

See [Automatic Data Synchronization](automatic-data-sync.md) for freshness,
live-game polling, retry, and database-global lease behavior.

## Turso storage

```bash
npm run import-season --year=2017 --storage=turso
```

Turso mode uses `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Those values are
validated only when Turso is selected. Example placeholders are rejected
before a connection attempt.

## Migrations that rebuild a table

SQLite cannot alter a `CHECK` constraint in place, so a migration that needs
to change one (for example, adding a new enum value) must rebuild the table:
create a replacement table with the new constraint, copy the rows across,
drop the original, and rename the replacement into place.

Foreign key enforcement is on by default. If any other table has an
`ON DELETE CASCADE` foreign key onto the table being rebuilt, dropping that
table triggers SQLite's implicit cascading `DELETE`, silently destroying the
dependent rows before the migration runner even reaches the `CREATE TABLE`
statement for the replacement. Foreign keys without `ON DELETE CASCADE` are
safer only in that they fail loudly (a `FOREIGN KEY constraint failed` error)
instead of silently losing data, but they still block the migration.

The migration runner (`migration-runner.ts`) disables foreign key enforcement
for the duration of every migration run and restores it immediately
afterward, so table-rebuild migrations no longer need to (and cannot,
individually) manage this themselves — `PRAGMA foreign_keys` is a no-op once
a transaction has started, so setting it inside a migration's own SQL has no
effect. `migration-runner.test.ts` includes a regression test that applies
the real repository migrations against seeded dependent-table rows to verify
this.

## Provider boundary

All modes implement the application-owned `DatabaseProvider` interface.
Application services and ESPN ingestion do not know which provider is active.
The libSQL and dummy providers both implement synchronization status and lease
operations so coordination can be tested without provider-specific application
logic. Unsupported dummy operations fail explicitly rather than returning
success-shaped placeholder results.
