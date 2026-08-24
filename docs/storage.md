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
3. `dummy`

## Dummy storage

```bash
npm run import-season --year=2017
```

Dummy storage is the default. It keeps canonical snapshots, source mappings,
import audits, and matchup overrides in memory for the lifetime of the process.
It supports the season import service but does not support arbitrary SQL.

The command prints canonical franchise, matchup, and score counts so ingestion
can be verified without a real database. Nothing is persisted after the
command exits, so a later dummy `refresh-season` command cannot find the prior
import.

## Local storage

```bash
npm run import-season --year=2017 --storage=local
npm run refresh-season --year=2017 --storage=local
```

Local mode uses the complete libSQL provider and defaults to the gitignored
`.data/fantasy-stats.db` file. Override the path with:

```bash
npm run import-season --year=2017 --storage=local \
  --database-file=/absolute/path/fantasy-stats.db
```

Local mode persists migrations, canonical data, audits, overrides, and scoring
views. It is suitable for development and local inspection but is not the
cross-computer source of truth.

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
