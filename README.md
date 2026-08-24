# Fantasy Stats

A local Next.js application for importing, correcting, querying, and visualizing
historical ESPN fantasy football data.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Credentials are validated only when the associated server-side database or ESPN
operation runs. See [local development setup](docs/development.md) and the
[initial plan](docs/initialPlan.md).

Import or refresh a season with the same application service used by the web
application:

```bash
npm run import-season --year=2017
npm run refresh-season --year=2017
```

Imports use nonpersistent dummy storage by default, allowing ESPN ingestion to
be tested without Turso. Select persistent local or Turso storage explicitly;
see [storage providers](docs/storage.md).

To use the web import dashboard, configure persistent storage in `.env.local`:

```text
FANTASY_STATS_STORAGE=local
```

Then run `npm run dev`. The dashboard lists imported seasons and audit history,
and can import or refresh completed seasons.
