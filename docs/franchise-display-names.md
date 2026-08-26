# Franchise Display Names

Fantasy franchises have stable application-owned IDs across seasons. Team names
change frequently, and ESPN owner fields may contain usernames or email
addresses rather than useful person names.

The `franchise_display_names` table stores one manually curated person name for
each canonical franchise ID:

```text
franchise_id -> display_name
```

These names are separate from imported ESPN data. Season refreshes may update
team names and owner metadata, but they do not replace curated display names.

Purpose-built season pages use the person display name as the stable franchise
label. If no curated name exists, the UI falls back to ESPN owner metadata and
then an explicit unknown-person label.

Imported names remain in `franchise_names` as lossless franchise history; a
franchise can have multiple valid historical names. `season_franchise_names`
separately stores exactly one ESPN team name returned for each franchise by
that season's latest import or refresh. Historical season pages may present
that explicit season-specific value, but the application still does not track
within-season rename dates. Migrations do not infer season-specific names from
global name history; a legacy season remains loadable with an unknown-team
fallback until a refresh supplies the name from ESPN.

Real names are private league data. Do not add them to migrations, fixtures,
documentation, logs, or the public repository. Populate them only through the
typed `FranchiseDisplayNameService` against the selected persistent database.
