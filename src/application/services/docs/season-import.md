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

## Workflow

1. Check the import or refresh precondition.
2. Create a running import audit record.
3. Load all known mappings for the source provider.
4. Fetch and canonically map the requested season.
5. Atomically persist the season snapshot and mark the audit successful.
6. If fetching or persistence fails, mark the audit failed and rethrow the
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

The opt-in live integration test imports every configured season into a
temporary local libSQL database, verifies persisted season counts and ANP
standings, then deletes the database.
