# Fantasy Stats Initial Plan

## Purpose

This repository will contain a personal application for importing, correcting, querying, and visualizing historical data from an ESPN fantasy football league.

The first version is for one user working across multiple computers. The code repository may be public, so it must never contain private league data or credentials. The application should be designed for extension, but the initial implementation should remain small and explicit.

## League terminology and scoring

### Adjusted NASCAR System

The **Adjusted NASCAR System** is the custom weekly scoring system used to determine playoff qualification. It combines a team's rank among all weekly fantasy scores with the result of its traditional head-to-head matchup.

Only regular-season weeks contribute to cumulative Adjusted NASCAR standings. Playoff and consolation data may still be imported and queried, but must not affect playoff-qualification totals.

Regular-season cumulative ANP determines playoff qualification and seeding.
ESPN-generated playoff seeds are not authoritative. Actual postseason matchups
are manually curated in ESPN and are authoritative; opponents must not be
inferred from seeds because higher seeds may select their opponents. See
[Playoff Qualification and Matchups](playoffs.md).

### NASCAR Points (NP)

For a league with `n` teams:

- Rank all teams from lowest to highest weekly fantasy score.
- The lowest-scoring team receives `1 NP`.
- The second-lowest receives `2 NP`.
- Continue through the highest-scoring team, which receives `n NP`.
- If teams have identical weekly scores, each receives the average of the rank points occupied by the tie.

For example, if three teams occupy ranks 5, 6, and 7, each receives:

```text
(5 + 6 + 7) / 3 = 6 NP
```

### Adjusted NASCAR Points (ANP)

A team's weekly ANP is its NP plus a head-to-head bonus:

- Win: add `n`
- Tie: add `n / 2`
- Loss: add `0`

Therefore:

```text
ANP = NP + head-to-head bonus
```

NP and ANP are derived values, not imported ESPN values or manually maintained totals.

## Initial scope

The canonical ESPN dataset includes:

- League and season information
- League settings needed by the application, including team count and regular-season boundaries
- Franchises and their known names
- Weekly head-to-head matchups
- Final weekly team scores
- Weekly roster snapshots with actual and projected fantasy points
- Canonical players, NFL teams, and season-scoped team/position history
- Draft picks, completed roster-changing transactions, and failed waiver claims
- Public NFL games and fantasy-relevant player game statistics

The supplemental datasets are independently refreshable. Historical weekly
rosters, structured transactions, drafts, and player-game statistics are
unavailable for 2017; the core matchup and score dataset remains supported.

## Application shape

Build a local full-stack web application using:

- TypeScript
- Next.js
- Server-only ESPN and database access
- Typed server-side application services
- Minimal HTTP route handlers only where browser interactivity requires them

Do not design a complete public REST or GraphQL API initially. The stable application boundary should be typed server-side methods. The browser should not communicate directly with Turso or receive ESPN credentials.

The application should provide two query surfaces:

1. Purpose-built pages and controls backed by typed application services.
2. A separate advanced, read-only SQL console for ad hoc historical exploration.

All mutations, including imports and score adjustments, must use validated application methods rather than arbitrary SQL from the advanced console.

## Hosted storage

### Initial provider

Use **Turso Cloud with libSQL** as the initial hosted source of truth.

Reasons for this choice:

- The database must be available from multiple computers.
- Private league data must remain outside the potentially public Git repository.
- A free service is the primary operational priority.
- The expected dataset and write concurrency are modest.
- libSQL is SQLite-compatible and supports portable exports.

Use the established libSQL engine rather than Turso's newer database engine, which was still described as an early-preview Turso Cloud offering during planning.

### Known provider risks

Do not assume that a free hosted provider will retain an inactive database forever. No sufficiently clear official Turso guarantee against inactivity deletion was established during planning.

Turso also does not provide a Supabase-style hosted table editor as a core requirement of this design. Database inspection and arbitrary queries will be handled by the application's read-only SQL console and command-line tooling.

Backups are manual initially. The application and migrations must make it straightforward to export and restore a portable SQLite database. Automated backups may be added later.

### Provider abstraction

Turso must not leak into client or domain code.

Define a dedicated database-provider interface with:

- Explicit methods
- Definite input and return schemas
- No provider-specific result objects
- No libSQL client types outside the adapter
- Clear errors rather than silent fallbacks

Application services depend on this interface, not on Turso. A future SQLite, PostgreSQL, or other implementation should be replaceable without changing consumers.

Provider portability is achieved through the interface and acceptance tests, not by pretending all SQL dialects are identical.

## Persistence implementation

Use:

- Explicit parameterized SQL
- Versioned `.sql` migration files
- Runtime validation at the database boundary
- Application-owned UUID strings for canonical entity IDs
- Separate mappings between canonical IDs and external provider IDs

Do not introduce an ORM or query builder initially. The schema is expected to be small enough that plain SQL is clearer.

Store fantasy scores and score adjustments as floating-point values. Scores use two decimal places, and tie comparisons should use that league scoring precision.

The exact table layout is deliberately deferred until implementation. The schema must nevertheless preserve the separation and behavior described below.

## Data categories

### Canonical imported data

ESPN-originated data belongs in dedicated imported-data tables, but those tables must use the application's canonical schema rather than ESPN's response schema.

The database is not a cache of ESPN JSON. ESPN payload structure must not become the persistence or domain model.

Imports should use idempotent upserts:

- Re-running an import is safe.
- Canonical imported rows contain the latest known ESPN state.
- A refresh may apply ESPN stat corrections.
- A lightweight import-run audit records what was attempted, when it ran, and whether it succeeded.

Full version history for every imported field is not required.

### Manual matchup adjustments

Manual data remains separate from imported data. Do not modify imported ESPN rows to apply corrections.

The only initial manual override concept is a typed `matchup_override` record that:

- Targets a franchise's score in a specific matchup
- Stores a floating-point additive score adjustment
- Requires a human-readable reason

Effective scores are:

```text
effective score = imported score + manual adjustment
```

No generic key/value override framework and no other override tables are required initially.

### Franchise identity

Each fantasy franchise receives an application-owned stable UUID that persists across seasons.

A franchise may use multiple team names, including multiple names within one season. Store a set of known names associated with the franchise. Tracking the effective dates or weeks for each name is not required.

Owner names may be attributes of the franchise. A separate manager entity or historical ownership-assignment model is not required initially.

ESPN IDs must not be canonical primary keys. Store provider identifiers in separate source-mapping records so another data source can be introduced later.

## Derived SQL model

Effective scores, NP, weekly ANP, and cumulative regular-season ANP standings should be exposed through SQL views.

SQL views were selected instead of TypeScript-only calculations because derived scoring must be directly available to the advanced SQL console.

Every database-provider implementation must pass the same provider-independent acceptance tests. At minimum, test:

- Normal NP ranking for an `n`-team week
- Highest and lowest score boundaries
- Two-way score ties
- Three-way or larger score ties
- Head-to-head wins and losses
- Head-to-head ties awarding `n / 2`
- Additive matchup adjustments
- ESPN refreshes changing imported scores without deleting adjustments
- Exclusion of playoff and consolation weeks from cumulative qualification ANP

Provider-specific SQL view definitions are acceptable as long as their externally observable results are identical.

## ESPN ingestion

### Source strategy

Prioritize ESPN's undocumented fantasy JSON API. The initial research reference was:

<https://gist.github.com/nntrn/ee26cb2a0716de0947a0a4e9a157bc1c>

Use HTML scraping only as a targeted fallback if a required field is unavailable through the API. Do not build API and scraping implementations in parallel without a demonstrated need.

### Source abstraction

All ESPN-specific work belongs behind one or more source-adapter interfaces:

- URL and query construction
- ESPN views and endpoint selection
- Authentication cookies
- Retries and HTTP errors
- Provider payload validation
- Mapping from ESPN payloads to canonical objects

The ingestion service consumes canonical source objects, not ESPN response types. A future source adapter must be introducible without changing persistence or client code.

### Runtime validation

Use Zod only at untrusted boundaries:

- ESPN responses
- Rows/results returned by database adapters

Zod schemas should validate unknown runtime data, produce useful field-level failures, and provide corresponding TypeScript types. Ordinary internal domain code does not need to wrap every object in Zod.

After successful validation, map ESPN payloads to canonical application objects.

Do not retain successful raw ESPN responses in the hosted database. If parsing fails, write a redacted diagnostic payload to a gitignored local location so an ESPN API change can be investigated. Diagnostic output must not expose authentication cookies or other secrets.

### Authentication

The ESPN league is private and requires authentication.

Supply ESPN cookies from a local, gitignored environment file on each computer. Expected values will likely include ESPN's `espn_s2` and `SWID` cookies, subject to confirmation during implementation.

Never:

- Commit credentials
- Store ESPN credentials in Turso
- Send them to browser code
- Include them in logs or diagnostic payloads

Validate required environment values at startup or before an import and return a clear setup error if they are missing.

### Import workflow

Expose manual season-level operations:

- `importSeason(year)` for historical backfill
- `refreshSeason(year)` for idempotently updating an existing season
- Targeted roster, transaction/draft, and player-stat retries

These names describe the desired application behavior, not a required final TypeScript signature.

Core data must succeed before supplemental imports begin. Roster and
transaction imports run independently; player statistics run afterward so
players discovered by either source are included. Each dataset is replaced
atomically, and a failed supplemental refresh retains the prior snapshot
without rolling back successful sibling datasets.

The local web app should provide explicit controls, per-dataset status, and
progress/error reporting. The same ingestion services may also be called by
CLI commands for recovery, scripting, and debugging.

Do not add scheduled imports initially. Week-specific fetching may be an internal ESPN adapter optimization, but week-level public controls are not required.

## Error handling and observability

Provider and validation errors must be explicit and actionable.

Important failures include:

- Missing or expired ESPN cookies
- ESPN authentication rejection
- Unexpected ESPN response shape
- Partial or inconsistent season data
- Database connection failure
- Migration failure
- Invalid database result shape
- Failed import transaction
- Invalid matchup adjustment

An import must not report success when only part of the intended canonical state was written. Use transactions where supported and record import-run failure details without leaking secrets.

## Options considered and rejected for now

### Data committed in this repository

Rejected because the repository may be public and league data can contain private names and history.

### Separate private data Git repository

Considered as a way to synchronize JSON/CSV snapshots across computers, but rejected as the primary source of truth in favor of a hosted database.

### Local SQLite database per computer

Rejected as the primary source of truth because manual adjustments and imported state need to remain synchronized across multiple computers.

### Managed PostgreSQL

Considered for its mature relational features, concurrency, and tooling. It was not selected initially because the project is single-user, modest in size, and prioritizes a permanently low-cost/free option. The provider abstraction should leave PostgreSQL as a future migration path.

### Cloudflare D1

Not selected because it is more tightly oriented around Cloudflare Workers and is less direct for a traditional local Next.js server than Turso/libSQL.

### HTML-first scraping

Rejected because structured JSON API responses are easier to validate and normalize. Scraping remains a fallback only.

### Raw ESPN payloads as the database model

Rejected because it would bind persistence and clients to an undocumented provider schema.

### ORM or query builder

Rejected initially in favor of explicit SQL and migrations. This can be revisited only if demonstrated complexity justifies it.

### TypeScript-only NP/ANP calculations

Rejected because derived scoring must be directly queryable through SQL. Cross-provider acceptance tests will manage the portability cost of database-side views.

## Suggested implementation order

1. Scaffold the local Next.js/TypeScript application and environment validation.
2. Define canonical domain types and Zod schemas for external boundaries.
3. Define database and fantasy-source interfaces before provider implementations.
4. Add a local SQLite-compatible development adapter and migration runner if useful for fast tests.
5. Implement the Turso/libSQL database adapter using parameterized SQL.
6. Create the initial canonical imported tables, source mappings, import audit, and matchup adjustment storage.
7. Implement effective-score and NP/ANP SQL views.
8. Add database-provider acceptance tests for all scoring rules.
9. Implement the authenticated ESPN source adapter and canonical mapping.
10. Add season import/refresh services with transactional upserts and audit records.
11. Add CLI commands using the same import services.
12. Build the first UI for imports, weekly results, ANP standings, and matchup adjustments.
13. Add the separate read-only SQL console.
14. Document and test manual export/restore procedures.

## Decisions intentionally deferred

- Exact table names and relationships beyond the required conceptual separation
- Exact database-interface method signatures
- Detailed UI navigation and visual design
- Automated import scheduling
- Automated backups
- Hosting the Next.js application
- Multi-user authentication and authorization

Any future decision should preserve the provider boundaries, canonical-data model, imported/manual separation, scoring rules, and secret-handling requirements in this document.
