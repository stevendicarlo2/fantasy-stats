# Implementation Guidance

Implement the requested change completely and keep it limited to the requested
scope.

## Sources of truth

1. Read the repository `AGENTS.md` and any nested `AGENTS.md` that applies to
   files being changed.
2. Read relevant repository-wide documentation in `docs/` and any co-located
   subsystem documentation before changing behavior.
3. Treat existing application-owned interfaces, domain schemas, migrations,
   and tests as the implementation contract. If those sources disagree with
   the request, surface the conflict rather than guessing.

## Development practices

- Preserve the separation between presentation, application/domain logic,
  external source adapters, and database adapters.
- Keep clients and application services dependent on application-owned typed
  interfaces. Do not expose ESPN, libSQL, Turso, or other provider-specific
  payloads outside their adapters.
- Use explicit parameterized SQL and versioned migration files. Never edit an
  applied migration; add the next numbered migration instead.
- Validate untrusted external and database data at adapter boundaries and
  surface failures explicitly.
- Preserve imported ESPN data separately from manually maintained corrections
  and display data.
- Do not add credentials, authentication material, private league data, or
  unredacted external payloads to code, fixtures, documentation, logs, or
  commits.
- Reuse existing helpers and patterns before introducing new abstractions.
- Add or update tests for externally observable behavior and architectural
  boundaries affected by the change.
- Update directly affected documentation when behavior, interfaces,
  assumptions, setup, or operational requirements change.
- Do not overwrite or revert unrelated working-tree changes.

## Implementation checks

Run the smallest relevant test or type-check while iterating. Before declaring
implementation complete, ensure the repository can pass:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Do not run credential-dependent live ESPN or Turso operations unless the task
explicitly requires them and suitable local credentials are already available.
