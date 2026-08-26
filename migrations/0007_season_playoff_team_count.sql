ALTER TABLE seasons
ADD COLUMN playoff_team_count INTEGER
  CHECK (
    playoff_team_count IS NULL
    OR (
      playoff_team_count > 0
      AND playoff_team_count <= team_count
    )
  );

-- Migration 0006 inferred these rows from unordered global name history.
-- Only an authoritative season refresh can supply season-specific names.
DELETE FROM season_franchise_names;
