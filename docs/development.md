# Local Development

## Prerequisites

- Node.js 22.13 or newer
- npm

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The application is available at <http://localhost:3000>.

## Environment variables

All credentials remain server-only and belong in the gitignored `.env.local`
file.

| Variable | Purpose |
| --- | --- |
| `FANTASY_STATS_STORAGE` | `local` (default), `dummy`, or `turso` provider |
| `FANTASY_STATS_LOCAL_DATABASE_FILE` | Local libSQL file path |
| `TURSO_DATABASE_URL` | Turso/libSQL database URL |
| `TURSO_AUTH_TOKEN` | Turso authentication token |
| `ESPN_LEAGUE_ID` | Numeric ESPN fantasy league identifier |
| `ESPN_EARLIEST_SEASON` | Earliest season available for import |
| `ESPN_S2` | Private ESPN league authentication cookie |
| `ESPN_SWID` | Private ESPN account identifier cookie |

Database credentials are validated when a database operation requests them.
ESPN credentials are validated separately when an import or refresh requests
them. This keeps unrelated development and production builds usable before
either integration is configured while still producing explicit setup errors
at the external boundary.

Do not add real credentials or league data to `.env.example`, tests, fixtures,
logs, or documentation.

## Season import CLI

Import and persist a season with the default local storage:

```bash
npm run import-season --year=2017
```

Select dummy storage explicitly for a nonpersistent ingestion check:

```bash
npm run import-season --year=2017 --storage=dummy
```

The command loads `.env.local`, uses the same season import service as the web
application, prints canonical record counts and the resulting audit run ID, and
closes the storage provider on success or failure.

Turso credentials are required only with `--storage=turso`. Values copied
unchanged from `.env.example` are rejected before any connection attempt. See
[storage providers](storage.md) for all modes and precedence rules.
