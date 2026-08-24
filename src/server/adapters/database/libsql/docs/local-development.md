# Local libSQL Development

The local database infrastructure uses `@libsql/client` with a `file:` URL. It
is intended for fast adapter development and acceptance tests against the same
SQLite-compatible engine family used by Turso.

## Migration runner

`createLocalMigrationRunner` receives:

- A local `file:` database URL, including `file::memory:` when appropriate
- A directory containing versioned SQL migration files

Migration filenames must follow:

```text
0001_descriptive_name.sql
```

Each four-digit version may be used only once.

The runner:

1. Loads migrations in filename order.
2. Creates the internal `_fantasy_stats_migrations` history table.
3. Verifies that previously applied files still exist and retain the same
   SHA-256 checksum.
4. Applies every pending migration in one write transaction.
5. Records each applied filename, checksum, and timestamp.

If any pending migration fails, all pending migrations from that run are rolled
back. Migration files must not contain their own transaction-control
statements.

## Boundaries

The public server-only module is `local-database.ts`. libSQL client and result
types remain internal to this adapter. The migration runner currently provides
infrastructure only; canonical fantasy tables and the complete
`DatabaseProvider` implementation are added in later implementation steps.
