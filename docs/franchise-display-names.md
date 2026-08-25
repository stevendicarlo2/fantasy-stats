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

Imported team names are retained for exploration, but the initial schema does
not track when each name was active. Purpose-built historical pages therefore
avoid presenting an arbitrary known team name as if it were season-specific.

Real names are private league data. Do not add them to migrations, fixtures,
documentation, logs, or the public repository. Populate them only through the
typed `FranchiseDisplayNameService` against the selected persistent database.
