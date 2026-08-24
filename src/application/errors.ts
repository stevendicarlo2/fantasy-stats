export class SafeOperationalError extends Error {
  readonly safeForAudit = true;
}
