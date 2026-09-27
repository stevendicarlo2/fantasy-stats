# Season Import Service

`SeasonImportService` coordinates source retrieval and persistence without
depending on ESPN or libSQL implementation types.

## Operations

### `importSeason(year)`

Imports a season that is not already stored. If the season exists, the service
returns an explicit error directing the caller to refresh it instead.

### `refreshSeason(year)`

Fetches the latest source state for a stored season. If the season does not
exist, the service returns an explicit error directing the caller to import it
first.

Both operations require an integer year between 1900 and 2100.

Production web and CLI entry points invoke these operations through
`DataSyncCoordinator`. The coordinator creates or joins the database-global
dataset lease, then calls `executeStartedRun` only for newly acquired work.
Direct `importSeason` and `refreshSeason` methods remain useful for isolated
service tests and deliberately record manual audit triggers.

## Workflow

1. Check the import or refresh precondition.
2. Prepare the provider and operation before lease acquisition.
3. Create a running import audit record directly or receive one from the
   coordinator.
4. Load all known mappings for the source provider.
5. Fetch and canonically map the requested season.
6. Atomically persist the season snapshot and mark the audit successful.
7. If fetching or persistence fails, mark the audit failed and rethrow the
   original error.

The database adapter owns the transaction that combines canonical writes and
the successful audit transition. A failed persistence transaction leaves the
audit running so the service can explicitly mark it failed.

## Failure safety

Errors marked as safe operational errors are recorded with their actionable
message. Unknown error messages are never persisted because they may contain
credentials, private payload data, or provider-specific diagnostics; their
audit message is `Unexpected import failure`.

If both the operation and failure-audit update fail, the service throws an
`AggregateError` containing both failures rather than hiding either one.

This service is reusable from both the local web application and CLI commands.
See `docs/automatic-data-sync.md` for freshness, dependency, retry, and lease
policy.

The opt-in live integration test imports every configured season into a
temporary local libSQL database, verifies persisted season counts and ANP
standings, then deletes the database.
