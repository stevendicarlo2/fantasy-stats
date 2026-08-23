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
