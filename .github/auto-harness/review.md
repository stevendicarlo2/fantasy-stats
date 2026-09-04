# Review Guidance

Review the complete working-tree diff against the user's request, repository
documentation, applicable `AGENTS.md` files, and existing architectural
boundaries.

## Required review

- Confirm the change fully addresses the requested behavior without unrelated
  modifications or speculative features.
- Look for correctness bugs, data loss, invalid state transitions, broken
  error handling, race conditions, and regressions in existing behavior.
- Verify presentation, application/domain logic, source adapters, and database
  adapters remain isolated behind application-owned interfaces.
- Reject direct client access to databases, Turso, ESPN, or other external
  providers.
- Check that SQL is parameterized, migration history remains immutable, and
  persistence changes preserve imported and manually maintained data
  separately.
- Check boundary validation and type safety; reject broad catches,
  success-shaped fallbacks, silent failures, and unnecessary type assertions.
- Check that no credentials, authentication material, private league data, or
  unredacted provider payloads are introduced.
- Confirm tests cover changed observable behavior and directly affected
  documentation is current.
- Account for pre-existing working-tree changes and do not require unrelated
  user changes to be reverted.

## Passing criteria

Pass only when the implementation is complete, internally consistent, scoped
to the request, and has no high-confidence correctness, security, privacy, or
data-integrity findings requiring another implementation iteration.

Report actionable findings with file and line references. Do not fail the
review for subjective style preferences or unrelated pre-existing issues.
