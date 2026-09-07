# Matchup Roster Data Implementation Plan

## Purpose

Implement complete historical fantasy rosters for each matchup, plus the
supporting player identities, projections, NFL game statistics, draft picks,
and roster-changing transactions needed to explain those rosters.

This document is the implementation contract for the feature. Read it with:

- [Fantasy Stats Initial Plan](initialPlan.md)
- [Storage Providers](storage.md)
- [Playoff Qualification and Matchups](playoffs.md)
- [ESPN Fantasy Source Adapter](../src/server/adapters/fantasy/espn/docs/adapter.md)

When this document and older deferred-scope language disagree, this document
defines the approved scope for roster, player, draft, transaction, and NFL game
stat ingestion.

## Product decisions

### Weekly fantasy rosters

- Import one current roster snapshot per fantasy franchise and scoring period.
  Completed periods are final; an active period is provisional.
- Include every rostered asset: starters, bench, and injured reserve.
- Import every scoring period containing a league matchup, including regular
  season, championship, consolation, and placement matchups.
- Preserve the lineup slot and source order needed to render the lineup.
- Treat weekly roster snapshots as authoritative for historical fantasy
  ownership. Transactions explain changes but never reconstruct ownership.
- During an active scoring period, import the current roster as provisional.
  A later refresh replaces it. Intra-week lineup history is out of scope.
- The existing imported or manually adjusted matchup score remains
  authoritative. Never recalculate it from player rows.

### Players and team defenses

- Player identity is global across seasons and uses an application-owned UUID.
- Map ESPN athlete IDs to canonical players through `source_mappings`.
- ESPN fantasy athlete IDs and public NFL athlete IDs are the same identifier;
  join them directly rather than matching names.
- Create canonical players referenced only by draft picks or imported
  transactions, including unsuccessful waiver targets.
- Represent D/ST entries as synthetic player records so roster entries have one
  consistent player reference.
- Add an explicit player kind that distinguishes `athlete` from
  `team_defense`. Never treat a D/ST record as a human athlete.
- Map a synthetic D/ST player to its ESPN NFL team ID. Do not create detailed
  player-game statistic rows for D/ST in this version.

### Fantasy points and projections

- Persist actual league-scoring fantasy points for every weekly roster entry.
- Persist projected fantasy points for every weekly roster entry when ESPN
  supplies a projection record.
- Store missing projections as `null`, not zero.
- Do not import projected passing, rushing, receiving, or kicking stat lines.
- Store fantasy points from the fantasy source; do not recalculate them from
  public NFL statistics.

### Actual NFL player statistics

- ESPN's public NFL game API is authoritative for actual player statistics.
- Store actual statistics once per canonical player and NFL game.
- Import statistics only for fantasy-relevant players: players referenced by an
  imported roster, draft pick, or retained transaction.
- Persist a player-game row only when ESPN supplies source-backed box-score or
  play data for that player. Do not synthesize zero-stat rows.
- A missing player-game row means "no imported stat line," not "the player
  participated and recorded zero."
- Defensive player and D/ST detail is out of scope.

Persist these canonical offensive statistics:

- Passing attempts
- Passing completions
- Passing yards
- Passing touchdowns
- Passing interceptions
- Rushing attempts/carries
- Rushing yards
- Rushing touchdowns
- Receptions
- Receiving targets
- Receiving yards
- Receiving touchdowns
- Total fumbles
- Fumbles lost
- Successful passing two-point conversions
- Successful rushing two-point conversions
- Successful receiving two-point conversions

Total touches are derived as:

```text
touches = rushing attempts + receptions
```

Persist these canonical kicking statistics:

- Extra points made
- Extra points missed
- Chronological array of made field-goal distances
- Chronological array of missed field-goal distances

Blocked field goals count in the missed array for this version.

### NFL-team and position history

- Track NFL-team affiliation independently from fantasy ownership.
- Track canonical player positions independently from lineup slots.
- Store both as season-scoped scoring-week ranges.
- A range has an inclusive start scoring period and inclusive end scoring
  period.
- Start a new range when the observed value changes or when observations have a
  gap. Do not infer continuity across unobserved weeks.
- Ranges never cross a season boundary. Presentation code may visually
  coalesce adjacent identical ranges across seasons.
- Position history must support simultaneous overlapping canonical positions.
- The current ESPN fantasy payload usually provides one default player
  position. Model the canonical relation as many-to-many even when the adapter
  emits one position.
- FLEX, RB/WR, WR/TE, OP, bench, IR, and other lineup eligibility slots are not
  canonical player positions.
- Keep the NFL team on each player-game statistic row in addition to the
  season/week affiliation range.

### Draft and transaction history

Import draft picks with:

- Drafting franchise
- Player
- Round
- Pick within round
- Overall pick
- Keeper flag
- Auction bid when supplied

Retain these post-draft transaction categories:

- Executed free-agent additions and associated drops
- Executed waiver additions and associated drops
- Failed waiver claims
- Executed trades
- Ownership-changing administrative roster actions, such as direct drops

For failed waiver claims, retain every available canonical detail:

- Claiming franchise
- Target player
- Conditional drop player, when present
- Scoring period
- Proposed and processed timestamps, when present
- FAAB or bid amount, when present
- Normalized failure reason

Observed ESPN failure statuses include:

- Auction budget exceeded
- Invalid player source
- Invalid IR slot
- Matchup acquisition limit
- Player already dropped
- Roster limit
- Roster lock

Retain only completed and failed waiver claims. Exclude pending and canceled
claims.

Retain only executed trades. ESPN may return proposal, acceptance, uphold,
decline, and cancellation records linked through `relatedTransactionId`.
Collapse the executed records for one trade workflow into one canonical trade
and do not import unsuccessful negotiation history.

Ignore slot-only `ROSTER`, `FUTURE_ROSTER`, and `RETRO_ROSTER` items. Retain an
administrative record only when an item changes fantasy ownership. Weekly
roster snapshots, not transaction items, remain authoritative for lineup slots.

## Source contracts

### ESPN fantasy source

Use the authenticated fantasy league API already encapsulated by the ESPN
adapter. Keep cookies, URL construction, provider schemas, and provider status
mapping inside ESPN-specific adapters.

For 2018 and later, weekly rosters are available through:

```text
/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
  ?view=mRoster
  &scoringPeriodId={scoringPeriod}
```

Roster entries expose:

- `playerId`
- `lineupSlotId`
- `status`
- `injuryStatus`
- `playerPoolEntry.player`

The nested player supplies:

- Stable ESPN player ID
- Name fields
- Default position ID
- Eligible lineup slots
- NFL team ID
- Weekly statistic records

Validate entry and player status fields, but historical injury-status display
is not part of the first canonical model or UI.

Weekly statistic records use:

- `statSourceId: 0` for actual values
- `statSourceId: 1` for projected values
- `statSplitTypeId: 1` for the weekly split
- `scoringPeriodId` for the fantasy scoring period
- `appliedTotal` for league-scoring fantasy points

Use the fantasy weekly record only for actual fantasy points and projected
fantasy points. Actual football statistics come from the public NFL source.

Transactions are available through:

```text
/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
  ?view=mTransactions2
  &scoringPeriodId={scoringPeriod}
```

Use the `x-fantasy-filter` transaction type filter. Relevant provider types
include:

- `FREEAGENT`
- `WAIVER`
- `WAIVER_ERROR`
- `TRADE_ACCEPT`
- `TRADE_UPHOLD`
- `ROSTER`

Draft results come from `mDraftDetail`, not transaction replay. Validate and
map the `draftDetail.picks` collection.

### ESPN public NFL source

Create a separate public NFL source adapter. It requires no fantasy cookies and
must not depend on the private fantasy adapter's payload types.

Discover regular-season NFL events by season and NFL week:

```text
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
  ?dates={year}
  &seasontype=2
  &week={week}
```

Load game box scores from:

```text
https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary
  ?event={eventId}
```

Load structured play-by-play from:

```text
https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/
  {eventId}/competitions/{eventId}/plays?limit=500
```

The box score directly supplies the requested passing, rushing, receiving,
fumble, and aggregate kicking values. Map by statistic group and validated
labels/descriptions inside the adapter; do not expose ESPN's positional arrays
to application services.

For field goals:

- Identify field-goal play types.
- Use the structured kicker participant reference to resolve the ESPN athlete
  ID.
- Use `statYardage` as the exact attempt distance.
- Classify the result from the validated play type.
- Preserve attempt order when constructing made and missed distance arrays.

For successful two-point conversions:

- Require `pointAfterAttempt.value === 2`.
- `pointAfterAttempt.text` identifies a pass or rush conversion.
- `patPasser` identifies the passer for a successful pass.
- `patScorer` identifies the successful receiver or rusher.
- Ignore failed attempts because this feature stores conversions, not attempts.

Do not parse athlete names to create joins. A narrow text fallback is
acceptable only if a required result cannot be obtained from validated
structured fields and the fallback is covered by fixtures.

## Historical coverage

- 2018 and later support distinct historical weekly roster snapshots,
  projections, draft results, and structured transaction history.
- The configured league's 2017 legacy `mRoster` response returns the same
  final-season roster regardless of `scoringPeriodId`.
- The configured league's 2017 legacy response does not expose the structured
  transaction collection used by this feature.
- Do not duplicate the 2017 final roster across matchup weeks.
- Do not import the separately available 2017 draft because the approved
  product decision is to skip all 2017 roster/transaction/draft data.
- Mark 2017 rosters, transactions/draft, and dependent fantasy-relevant player
  stats as unavailable from the provider.
- Keep existing 2017 core season, matchup, and score data usable.

Unavailable is a distinct dataset state. It is not a successful import with
zero records and not a retryable failure.

## Canonical model

Use application-owned types and Zod schemas. Names below are the intended
concepts; align exact identifiers with existing repository conventions.

### Player catalog

`Player`

- `id`
- `kind`: `athlete | team_defense`
- `displayName`
- Optional first and last name

Extend `SourceEntityType` for at least:

- `player`
- `nfl_team`
- `nfl_game`
- `transaction`
- `draft_pick`

Continue using application UUIDs as primary keys and provider IDs only in
`source_mappings`.

### Matchup scoring periods

The current `Matchup.week` represents ESPN's matchup period. Add an explicit
relation from a matchup to each contained fantasy scoring period.

This is required because historical leagues may have multi-week matchups. Do
not assume one matchup period equals one scoring period.

### Weekly roster snapshot

`WeeklyRosterSnapshot`

- Season
- Fantasy scoring period
- Franchise
- State: `provisional | final`
- Ordered roster entries

`WeeklyRosterEntry`

- Snapshot
- Canonical player, including synthetic D/ST players
- Canonical lineup slot
- Source order within the roster
- Actual fantasy points
- Projected fantasy points or `null`

Use a uniqueness constraint that prevents the same canonical player from
appearing twice for one franchise and scoring period.

### NFL teams and history

`NflTeam`

- Canonical ID
- Stable ESPN team mapping
- Abbreviation and display name

`PlayerNflTeamRange`

- Player
- Season
- NFL team
- Inclusive start scoring period
- Inclusive end scoring period

`PlayerPositionRange`

- Player
- Season
- Canonical position
- Inclusive start scoring period
- Inclusive end scoring period

Range-building must be deterministic and idempotent. Replacing one season's
dataset must not mutate another season's persisted ranges.

### NFL games and player-game statistics

`NflGame`

- Canonical ID and ESPN event mapping
- NFL season year
- NFL season type
- NFL week
- Start time
- Home NFL team
- Away NFL team
- Completion state

`PlayerGameStats`

- Player
- NFL game
- NFL team represented in that game
- Every approved offensive statistic
- Extra points made and missed
- Made field-goal distance array
- Missed field-goal distance array

Persist distance arrays as validated JSON arrays of non-negative integers if
the storage layer has no native array type. Database adapters must parse and
validate them before returning application objects.

### Drafts and transactions

Use separate canonical draft-pick storage rather than forcing draft-specific
round and keeper fields into generic transaction items.

`DraftPick`

- Season
- Canonical player
- Franchise
- Round
- Pick within round
- Overall pick
- Keeper flag
- Auction bid or `null`

`FantasyTransaction`

- Canonical ID and provider mapping
- Season
- Scoring period
- Kind: `free_agent | waiver | trade | administrative`
- Outcome: `executed | failed`
- Acting franchise when applicable
- Proposed, processed, and accepted timestamps when available
- Bid amount when available
- Normalized failure reason when applicable

`FantasyTransactionItem`

- Transaction
- Canonical player
- Action: `add | drop | trade`
- From franchise or `null`
- To franchise or `null`

Support multi-item and multi-team transactions. Do not assume one add and one
drop per transaction.

## Import architecture

### Dataset boundaries

Implement four independent atomic dataset imports:

1. Core season, franchise, matchup, and score data
2. Weekly rosters and fantasy projections
3. Draft picks and retained transactions
4. Public NFL games and player-game statistics

Each dataset gets:

- Its own source port operation
- Its own canonical snapshot/schema
- Its own application service or explicit service method
- Its own database commit transaction
- Its own import audit result
- Its own targeted retry path

Do not append rosters, transactions, or NFL stats to `SeasonImportSnapshot`.
Separate snapshots preserve the required failure boundaries.

### Refresh-all orchestration

The existing import/refresh UI remains season-scoped.

For a new season or "Refresh all data":

1. Import or refresh core data.
2. If core fails, stop. Supplemental datasets require the canonical season.
3. Run roster and transaction/draft imports independently.
4. After those attempts, run player-game statistics using every canonical
   fantasy-relevant player currently available from successful or previously
   persisted roster, draft, and transaction data.
5. Report a success or failure result for every attempted dataset.

Supplemental failure does not roll back successful core or sibling datasets.
An individual dataset commit is atomic: fetch and validate the complete
season-level snapshot before replacing that dataset's persisted season rows.
If fetching or persistence fails, retain the last successful snapshot.

### Audit and availability

Evolve import auditing so runs identify their dataset:

- `core`
- `rosters`
- `transactions`
- `player_stats`

The dashboard must distinguish:

- Running
- Succeeded
- Failed
- Unavailable from provider

Store the last successful completion time per dataset and season. A provider
limitation is not an exception-shaped failure and should not show a retry
action.

### Refresh semantics

- Re-imports are idempotent.
- Replace the selected season's imported dataset atomically.
- Reuse source mappings so canonical IDs remain stable.
- Remove dataset rows no longer present in the refreshed canonical snapshot.
- Retain source mappings so removed entities recover the same canonical ID if
  they reappear in a later refresh.
- Preserve manual matchup adjustments.
- Preserve successfully imported sibling datasets when another dataset fails.
- Replace provisional current-week roster data on refresh.

## Implementation sequence

Keep each step independently green before moving to the next:

1. Add canonical domain types, source ports, and Zod schemas for matchup scoring
   periods, players, roster snapshots, drafts/transactions, NFL teams, and
   player-game statistics. This step is complete when the new contracts express
   every approved field without ESPN payload types.
2. Add the next numbered migration and implement database-provider reads,
   atomic commits, replacements, source mappings, and dataset audits. This step
   is complete when provider contract tests prove idempotence, isolation, and
   refresh behavior.
3. Implement the ESPN fantasy roster and transaction/draft adapter operations.
   This step is complete when fixtures cover modern weekly rosters, projections,
   drafts, retained transaction outcomes, multi-item trades, administrative
   ownership changes, and the 2017 unavailable result.
4. Implement the public ESPN NFL game adapter. This step is complete when
   fixtures map all approved statistics, exact field-goal distances, and
   successful two-point conversions through ESPN athlete IDs.
5. Implement the four dataset services and refresh-all orchestration. This step
   is complete when core gating, supplemental independence, atomic replacement,
   and targeted retries are covered by service tests.
6. Add application reads and the dedicated matchup route. This step is complete
   when single-week, multi-week, playoff, consolation, provisional, and bye
   matchups render the approved roster view.
7. Update affected repository and adapter documentation. This step is complete
   when a new session can discover the tables, source boundaries, import
   controls, historical limitations, and SQL joins without external context.

## Application and UI

### Import dashboard

Extend the imported-season table to show dataset status for:

- Core
- Rosters
- Transactions
- Player stats

Keep one primary import/refresh-all action for the selected season. Show
targeted retry controls for failed roster, transaction, and player-stat
datasets. Show provider-unavailable datasets without a retry button.

Partial success must be explicit. Do not collapse it into a generic successful
or failed season message.

### Matchup roster detail

Add a dedicated route:

```text
/seasons/{year}/matchups/{matchupId}
```

Link each existing matchup card to this route.

The page must:

- Use the existing imported/adjusted matchup score in its header.
- Show both franchises, or one franchise for a bye.
- Group roster entries as starters, bench, then IR.
- Order starters by canonical lineup-slot order.
- Preserve source order within equivalent groups or slots.
- Initially show player name, lineup slot, actual fantasy points, and projected
  fantasy points.
- Show D/ST synthetic players like other roster entries.
- Mark provisional scoring-period snapshots clearly.
- Use a tab or selector when a matchup contains multiple scoring periods.
- Keep the combined matchup score in the header for a multi-week matchup.

Detailed player-game stat presentation is not part of the first UI. The data
must still be queryable through the read-only SQL console and exposed through
typed application reads for future UI work.

## Error handling and privacy

- Validate every ESPN fantasy and public NFL response with Zod at its adapter
  boundary.
- Reject unknown required enum values and structurally inconsistent records
  with safe operational errors.
- Never substitute missing projections or statistics with zero.
- Never continue with a partial season snapshot inside one dataset.
- Keep fantasy cookies server-only.
- Do not persist raw ESPN payloads.
- Diagnostics may contain structural paths, keys, enum values, and counts, but
  no private league names, owner names, roster contents, transaction contents,
  cookies, or authentication material.
- The public NFL adapter must not receive fantasy authentication values.

## Migration and documentation requirements

- Add new numbered migrations; never edit an applied migration.
- Update `source_mappings` constraints for the new entity types.
- Preserve existing data and scoring views.
- Update [Fantasy Stats Initial Plan](initialPlan.md) to remove roster, player,
  and transaction ingestion from deferred scope after implementation.
- Update [Storage Providers](storage.md) with dataset-level import,
  availability, and refresh behavior.
- Update the ESPN adapter documentation with the new fantasy views and
  historical boundary.
- Add public NFL adapter documentation beside its implementation.
- Document the new tables and useful joins for the SQL console so Copilot query
  generation can discover them from repository context.

## Verification contract

The implementation is complete only when all of the following are covered by
tests and pass for every applicable database provider:

### Domain and adapter validation

- Valid weekly roster payloads map starters, bench, IR, fantasy points, and
  projections.
- Unknown lineup slots and malformed player/stat records fail explicitly.
- D/ST maps to a synthetic `team_defense` player.
- Fantasy and public NFL athlete IDs join directly.
- Public NFL box scores map every approved offensive stat.
- Fumbles and fumbles lost remain distinct.
- Successful pass, rush, and receiving two-point conversions map to the correct
  players.
- Made and missed field-goal distances preserve play order.
- No defensive detail rows are produced.

### Historical behavior

- Multi-week matchup periods retain every scoring period.
- The matchup detail read returns the correct roster for each tab.
- 2017 supplemental datasets report unavailable and do not create fabricated
  weekly rows.
- 2018-and-later weekly snapshots differ when the source roster differs.
- Missing projections remain `null`.

### Transactions and drafts

- Draft picks retain round, pick, overall pick, keeper, and bid data.
- Executed free-agent and waiver moves retain all items.
- Failed waiver claims retain target, optional drop, bid, period, timestamps,
  and normalized reason.
- Pending and canceled waiver claims are excluded.
- Related executed trade workflow records collapse to one canonical trade.
- Trade proposals and declines are excluded.
- Slot-only roster administration is excluded.
- Ownership-changing administrative actions are retained.

### Persistence and orchestration

- Re-importing a dataset is idempotent and preserves canonical IDs.
- A failed dataset refresh retains its previous successful snapshot.
- A supplemental failure does not roll back core or another supplemental
  dataset.
- A core failure prevents supplemental execution.
- Team and position ranges split on changes and observation gaps.
- Team and position ranges never cross season boundaries.
- Manual matchup adjustments survive every refresh path.
- Local, Turso, and dummy implementations honor the application-owned
  persistence contract or fail explicitly where the existing provider contract
  permits unsupported behavior.

### UI

- Existing matchup cards link to the dedicated detail route.
- Matchup detail shows both rosters, or one roster for a bye.
- Entries render starters, bench, and IR in the approved order.
- Actual and projected points render independently.
- Provisional snapshots are labeled.
- Multi-week matchups render separate scoring-period tabs.
- Dataset status and targeted retry actions reflect succeeded, failed, and
  unavailable states.

Run the existing lint, typecheck, test, and production build commands after the
targeted tests pass.
