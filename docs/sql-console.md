# Read-Only SQL Console

The web application exposes an advanced SQL console at `/sql` for ad hoc
inspection of imported and derived fantasy data.

The console uses the application-owned database provider. Browser code never
connects directly to local libSQL or Turso.

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
