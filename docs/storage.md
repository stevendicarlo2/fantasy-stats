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
drafts, transactions, NFL games, player-game statistics, audits, overrides,
and scoring views. It is suitable for development and local inspection but is
not the cross-computer source of truth.

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
seasons and recent import runs, shows the latest state of each dataset, and
provides full refresh and targeted supplemental retry actions.
Imported season links show cumulative regular-season ANP qualification
standings and weekly effective-score, NP, head-to-head bonus, and ANP results.
Each matchup links to weekly roster detail with actual and projected fantasy
points. Multi-week matchups expose one roster view per scoring period.

## Turso storage

```bash
npm run import-season --year=2017 --storage=turso
```

Turso mode uses `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Those values are
validated only when Turso is selected. Example placeholders are rejected
before a connection attempt.

## Provider boundary

All modes implement the application-owned `DatabaseProvider` interface.
Application services and ESPN ingestion do not know which provider is active.
Unsupported dummy operations fail explicitly rather than returning
success-shaped placeholder results.
