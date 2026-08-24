# Provider Contracts

Application services depend on the interfaces in this directory. Provider
implementations must not expose ESPN payloads, libSQL result objects,
credentials, or provider-specific errors as successful return values.

## Fantasy source

`FantasySource.fetchSeason` retrieves one season and returns a validated
`SeasonImportSnapshot`.

The application supplies known source mappings to the adapter. The adapter may
reuse those canonical IDs and create application UUIDs for newly discovered
entities, but it must not query the database directly. Its responsibilities
include provider requests, authentication, response validation, canonical
mapping, and redacted failure diagnostics.

## Database provider

`DatabaseProvider` exposes explicit operations for:

- Applying versioned migrations
- Loading provider mappings needed by a source adapter
- Recording an import attempt
- Atomically upserting a complete season snapshot and marking its import run
  successful
- Marking an import run failed
- Reading imported season data
- Managing typed matchup overrides
- Executing arbitrary read-only SQL

`commitSeasonImport` is the import transaction boundary. Implementations must
not return success if only part of the snapshot was written.

`executeReadOnlyQuery` must reject mutating statements. Results use
application-owned scalar values (`string`, `number`, or `null`) and rectangular
rows; provider-specific integer, blob, or result wrapper types must be mapped
or rejected inside the adapter.

## Boundary validation

Adapters validate returned domain records with schemas from `src/domain` and
validate migration and arbitrary-query results with the schemas in this
directory. Application services consume the definite interface types after
validation.

Detailed scoring query methods are deferred until the SQL views and their
application services are defined.
