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
