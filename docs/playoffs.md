# Playoff Qualification and Matchups

## Qualification and seeding

Regular-season cumulative Adjusted NASCAR Points determine playoff
qualification and playoff seeds.

ESPN-generated playoff seeds are not authoritative and must not be imported as
canonical qualification or seeding data. They may differ from the league's ANP
standings because the league applies its own qualification system.

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
