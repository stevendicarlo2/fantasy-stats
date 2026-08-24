# ESPN Fantasy Source Adapter

The ESPN adapter implements the application-owned `FantasySource` interface.
It retrieves private league data, validates the undocumented response, and
returns a canonical `SeasonImportSnapshot`.

## Endpoints

For 2018 and later:

```text
/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}
```

For 2017 and earlier:

```text
/apis/v3/games/ffl/leagueHistory/{leagueId}?seasonId={year}
```

Legacy responses are arrays containing one league object. The adapter requests
settings, teams, matchups, matchup scores, and scoreboard views.

## Authentication

Private-league requests send `espn_s2` and `SWID` cookies from validated
server-only environment configuration. Cookies are never returned from the
adapter, sent to browser code, or written to diagnostics.

## Canonical identity

Provider mappings use league-scoped external IDs:

- League: `{leagueId}`
- Season: `{leagueId}:{year}`
- Franchise: `{leagueId}:{teamId}`
- Matchup: `{leagueId}:{year}:{matchupId}`

Live verification across 2017–2025 confirmed that ESPN team IDs remain stable
for continuing franchises, including the league's expansion from 10 to 14
teams. Existing canonical mappings are reused; new provider entities receive
application UUIDs.

## Playoff interpretation

ESPN-generated playoff seeds are ignored.

Regular-season ANP standings determine the league's actual qualification and
seeding. The actual postseason schedule in ESPN is authoritative because it is
manually curated and may reflect opponent selection rather than a standard
seed-based bracket.

ESPN's matchup `playoffTierType` classifies postseason records:

- `WINNERS_BRACKET` maps to `playoff`
- `WINNERS_CONSOLATION_LADDER` maps to `consolation`
- `LOSERS_CONSOLATION_LADDER` maps to `consolation`

Postseason records may omit an away team to represent a bye.

## Validation and failures

The adapter rejects:

- Authentication failures
- Non-success HTTP responses
- Non-JSON responses
- Unexpected modern or legacy payload shapes
- Mismatched league or season IDs
- Unknown team references
- Unrecognized postseason bracket tiers
- Canonically inconsistent season snapshots

Successful raw ESPN payloads are discarded. When payload validation fails, the
adapter writes only a redacted structural diagnostic containing validation
paths, top-level keys, and record counts under the gitignored
`.diagnostics/espn/` directory. It does not write team names, owner names,
scores, cookies, or raw payload content.

## Verification

Synthetic tests cover modern and legacy responses, canonical mapping,
postseason byes, authentication rejection, and diagnostic redaction.

The opt-in live smoke test runs when the four ESPN environment values are
available to the test process. It maps every season from the configured
earliest year through 2025 without storing raw or canonical private data.
