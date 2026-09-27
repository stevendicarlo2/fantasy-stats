# Automatic Data Synchronization

Season data uses request-driven stale-while-revalidate synchronization. A data
page returns the currently persisted snapshot immediately, then starts or joins
background work when the requested data is stale. Clients poll through server
actions and refresh rendered data after a successful import.

`DataSyncCoordinator` owns synchronization policy. Existing read services
remain pure: they read persisted application-owned models without knowing
about freshness, ESPN, leases, or client polling. `SeasonDataQueryService`
combines those reads with coordinator observation for web data pages.

## Dataset keys

Freshness, leases, failures, and active work are tracked independently for each
`(season year, dataset)` pair:

- `core`: season configuration, franchises, matchups, scores, and standings
- `rosters`: weekly fantasy rosters
- `transactions`: transactions and draft data
- `player_stats`: NFL games, players, and player-game statistics

Core is a prerequisite for every supplemental dataset. Rosters are also a
prerequisite for player stats. Transactions and rosters may run concurrently
after core succeeds.

## Automatic policy

Only the highest persisted season whose source reports `isActive` is eligible
for automatic synchronization. Historical seasons can still be refreshed
manually from the dashboard.

The normal freshness window is one hour. During a live game window, core,
rosters, and player stats use a one-minute window. A game is live after its
kickoff while it is incomplete, with a six-hour maximum window to prevent a
stale incomplete game from keeping live mode active indefinitely.

Automatic synchronization is demand-driven:

- Opening or polling a data page is a real request that may start work.
- Non-live pages do not run an hourly browser timer after data is fresh.
- Live pages poll every minute while idle so active users continue requesting
  current data.
- Active work is polled every two seconds.
- SQL console reads never trigger synchronization.

The page profiles are:

| Page | Normal datasets | Live datasets |
|---|---|---|
| Season | core | core, rosters, player stats |
| Matchup | core, rosters, player stats | core, rosters, player stats |
| Adjustments | core | core |

Clients do not calculate freshness or dependencies. The server returns whether
relevant work is active, a success revision, and the next polling delay.

## Failure behavior

Failed automatic attempts use delays of 1, 2, 5, and then 10 minutes, capped at
10 minutes for later consecutive failures. The next requested observation
starts work after the delay expires. A client already following an automatic
attempt receives the remaining retry delay so recovery can continue without
requiring navigation.

An `unavailable` result suppresses automatic retries. Manual dashboard actions
remain available.

The last successful run's start time drives freshness. A later failure does not
erase that timestamp. Status also retains the latest attempt and consecutive
failure count so the dashboard can show a current error independently.

## Global deduplication

`sync_leases` provides a database-global lease per season and dataset. Every
coordinated attempt:

1. Prepares the provider operation and validates import-versus-refresh rules.
2. Atomically acquires the lease and creates a running audit row, or joins the
   existing running row.
3. Renews the lease heartbeat while provider work is active.
4. Atomically writes successful dataset data and completes the audit.
5. Releases the lease on success, failure, or unavailable completion.

Leases expire after five minutes and are renewed every minute. A caller that
encounters an expired lease marks its abandoned audit failed and acquires a new
run. The abandoned owner may still finish its external request, but it can no
longer commit through the no-longer-running audit row.

Every acquired attempt remains in `import_runs`. Joined callers share the
existing run ID and do not create duplicate audit history.

## Runtime model

Background execution is best effort inside the current Node.js process. This
is intentionally not a durable job queue. Database leases provide
cross-process deduplication and crash recovery, while polling provides
completion detection.

The web runtime retains in-process promises for work it owns so server actions
can return immediately. The CLI uses the same coordinator but waits for the
acquired or joined run to become terminal before exiting.

## User interface

The import dashboard owns detailed synchronization controls and state:

- The top form imports only seasons that are not yet persisted.
- Imported seasons provide Refresh all and per-dataset refresh buttons.
- Status distinguishes active work, last successful synchronization, and the
  latest failure.
- Relative timestamps expose the exact local timestamp in their tooltip.
- The audit table continues to show the latest ten runs.

Season data pages show only a compact generic syncing indicator. They do not
expose dataset names, freshness policy, or failure details.
