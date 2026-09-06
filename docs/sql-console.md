# Read-Only SQL Console

The web application exposes an advanced SQL console at `/sql` for ad hoc
inspection of imported and derived fantasy data.

The console uses the application-owned database provider. Browser code never
connects directly to local libSQL or Turso.

## Copilot query generation

The console can send a natural-language data question to the GitHub Copilot
CLI installed on the same machine as the Next.js server. **Generate query**
fills the SQL and parameter editors for review. **Generate & run** also sends
the generated query through the existing read-only console service and
database transaction.

Generation starts a fresh non-interactive `copilot` process with a fixed schema
and scoring glossary in its prompt. Custom instructions, built-in MCP servers,
remote access, and all tools are disabled for that process. Tool isolation uses
both a non-matching tool allowlist and an explicit denylist. The subprocess also
receives only the operating-system, user-profile, certificate, and Copilot
configuration variables needed to start; application credentials such as Turso
and ESPN environment variables are not inherited. The response must be a strict
JSON object containing a SQL statement and parameter array. The process is
limited to 60 seconds and 64 KiB of output, and malformed output is reported as
an error.

This feature is local-only. The `copilot` executable must be available on the
server process's `PATH` and authenticated for the local user. A remotely hosted
Next.js server cannot invoke a Copilot CLI installation on a user's computer.

## Supported queries

The console accepts one statement beginning with:

- `SELECT`
- `WITH`
- `EXPLAIN`

Mutation and database-management keywords are rejected, including `INSERT`,
`UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER`, `PRAGMA`, and transaction
statements. Multiple statements are also rejected.

Query parameters use `?` placeholders. Enter parameter values as a JSON array:

```sql
SELECT *
FROM regular_season_anp_standings
WHERE season_year = ?;
```

```json
[2017]
```

Parameters may contain strings, finite numbers, and `null`. The console accepts
at most 50 parameters and displays at most the first 500 result rows.

## Starter queries

The page includes editable examples for:

- Imported seasons
- Regular-season ANP standings
- Weekly effective scores, NP, head-to-head bonuses, and ANP
- Manual matchup score adjustments

The console is intentionally read-only. Imports, refreshes, and matchup
adjustments must continue to use their validated application workflows.
