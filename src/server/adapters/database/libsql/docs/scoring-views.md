# Scoring Views

Migration `0002_scoring_views.sql` exposes the Adjusted NASCAR System directly
to SQL consumers.

## `effective_matchup_scores`

One row per franchise and matchup:

```text
effective_score = round(imported_score + score_adjustment, 2)
```

The adjustment is zero when no `matchup_override` exists.

## `weekly_nascar_points`

Ranks every franchise from lowest to highest effective score within a season
and week. The lowest score receives `1 NP` and the highest receives `n NP`,
where `n` is the season team count.

Ties receive the average of their occupied ranks. For example, three teams
occupying ranks 3, 4, and 5 each receive `4 NP`.

## `weekly_adjusted_nascar_points`

Adds the head-to-head bonus to weekly NP:

- Win: `n`
- Tie: `n / 2`
- Loss: `0`

The view exposes imported score, adjustment, effective score, NP, bonus, and
final ANP for auditing.

A postseason bye retains NP based on the full week's scores but has no
head-to-head opponent, bonus, or ANP result.

## `regular_season_anp_standings`

Sums NP, head-to-head bonuses, and ANP only for matchups whose phase is
`regular`. Playoff and consolation rows remain queryable through the weekly
views but never contribute to qualification standings.

The standings view also exposes weeks played and qualification rank ordered by
descending cumulative ANP.

## Data completeness

The canonical season snapshot boundary requires every participating franchise
to appear in exactly one matchup within each imported week. This prevents
partial or duplicate weekly schedules from producing valid-looking rankings.
