# Verification Guidance

Verify the current repository state using Node.js 22.13 or newer. Use the
existing npm dependencies and scripts; install dependencies only if they are
missing.

Run all of the following checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Verification passes only when every command exits successfully.

Do not run credential-dependent live ESPN imports, Turso writes, development
servers, or other external operations unless the requested change explicitly
requires them. Never print credentials or private league data while verifying.

If a check fails, report the command, relevant failure output, and whether the
failure is caused by the working-tree change or is demonstrably pre-existing.
