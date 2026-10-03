# Playoff Qualification and Matchups

## Qualification and seeding

Regular-season cumulative Adjusted NASCAR Points determine playoff
qualification and playoff seeds.

ESPN-generated playoff seeds are not authoritative and must not be imported as
canonical qualification or seeding data. They may differ from the league's ANP
standings because the league applies its own qualification system.

The number of playoff teams is season configuration imported from ESPN rather
than a fixed application constant. The regular-season dashboard uses that
value only to place the default-standings qualification boundary. A legacy
season with no imported value remains loadable and omits the boundary until
the season is refreshed.

## Playoff matchups

The matchup schedule recorded in ESPN is authoritative. It reflects the
league's manually curated playoff bracket and should be imported as shown.

Playoff matchups are not generated mechanically from seeds. A higher-seeded
team may select its opponent, so the first round does not necessarily use a
standard bracket such as `3 vs. 6` and `4 vs. 5`.

The application must therefore:

- Derive qualification and seeds from regular-season ANP standings.
- Import actual playoff and consolation matchups from ESPN.
- Never infer playoff opponents from either ESPN seeds or ANP seeds.
- Preserve postseason bye records when ESPN reports a matchup with only one
  participating franchise.

## Postseason scoring

Playoff and consolation scores remain queryable, but they do not contribute to
regular-season qualification standings. A postseason bye has no head-to-head
opponent, bonus, or ANP result.

## Postseason phases

`matchups.phase` distinguishes four postseason states, mirroring ESPN's own
bracket tiers:

- `playoff` — still contesting the championship bracket (ESPN's
  `WINNERS_BRACKET`).
- `playoff_eliminated` — already eliminated from the championship bracket and
  playing placement games (ESPN's `WINNERS_CONSOLATION_LADDER`).
- `consolation` — never qualified for the championship bracket at all (ESPN's
  `LOSERS_CONSOLATION_LADDER`).
- `consolation_eliminated` — lost a `consolation`-phase matchup earlier in the
  season. ESPN does not expose a further sub-tier for the consolation bracket,
  so the application derives this itself: the loss that causes elimination
  keeps the `consolation` phase, and later matchups involving that franchise
  are reclassified as `consolation_eliminated`.

These phases are informational, not exhaustive filters: eliminated teams keep
playing every remaining postseason week, and their scores stay in the
database and remain queryable via the eliminated phase values when needed.

## Unplayed matchups

ESPN schedules every matchup period for the full season up front and reports
a score of 0 for any period that has not started yet, indistinguishable from
a genuine final score. The ESPN adapter tracks the league's current scoring
period and omits score rows for any matchup period it has not reached, so an
unplayed matchup has no rows in `imported_matchup_scores` at all rather than
a misleading 0. Views and queries built on `imported_matchup_scores` use inner
joins, so unplayed matchups are excluded automatically.
