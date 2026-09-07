# ESPN NFL Source Adapter

The public ESPN NFL adapter implements the application-owned `NflSource`
interface. It does not receive or send private fantasy-league credentials.

## Requests

For every fantasy scoring period, the adapter loads the NFL scoreboard and
then fetches each game's summary and play-by-play with bounded concurrency.
The scoreboard supplies game and team identity, summaries supply box-score
statistics, and play-by-play supplies exact field-goal distances and
two-point-conversion participants.

## Mapping

Fantasy athlete source IDs match public ESPN NFL athlete IDs. The adapter
filters output to application-provided relevant athletes and maps public NFL
team and game IDs through canonical source mappings.

The canonical stat line includes passing, rushing, receiving, fumble,
two-point-conversion, extra-point, and field-goal data. Made and missed
field-goal distances retain chronological order. The adapter does not create
synthetic zero-stat rows and does not import defensive detail or projected
stat lines.

## Validation and failures

Every public response is validated before mapping. HTTP failures, invalid JSON,
unexpected payloads, missing competitors, and unsupported stat values surface
as explicit operational errors. A season import replaces player-game data only
after the complete canonical snapshot passes validation.
