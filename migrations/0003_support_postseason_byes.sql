DROP VIEW regular_season_anp_standings;
DROP VIEW weekly_adjusted_nascar_points;
DROP VIEW weekly_nascar_points;
DROP VIEW effective_matchup_scores;

CREATE TABLE matchups_with_byes (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week > 0),
  phase TEXT NOT NULL CHECK (phase IN ('regular', 'playoff', 'consolation')),
  home_franchise_id TEXT NOT NULL REFERENCES franchises(id),
  away_franchise_id TEXT REFERENCES franchises(id),
  CHECK (
    away_franchise_id IS NULL
    OR home_franchise_id <> away_franchise_id
  ),
  CHECK (phase <> 'regular' OR away_franchise_id IS NOT NULL)
);

CREATE TABLE imported_matchup_scores_with_byes (
  matchup_id TEXT NOT NULL
    REFERENCES matchups_with_byes(id) ON DELETE CASCADE,
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  score REAL NOT NULL,
  PRIMARY KEY (matchup_id, franchise_id)
);

CREATE TABLE matchup_overrides_with_byes (
  id TEXT PRIMARY KEY,
  matchup_id TEXT NOT NULL REFERENCES matchups_with_byes(id),
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  score_adjustment REAL NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (matchup_id, franchise_id)
);

INSERT INTO matchups_with_byes
SELECT * FROM matchups;

INSERT INTO imported_matchup_scores_with_byes
SELECT * FROM imported_matchup_scores;

INSERT INTO matchup_overrides_with_byes
SELECT * FROM matchup_overrides;

DROP TABLE matchup_overrides;
DROP TABLE imported_matchup_scores;
DROP TABLE matchups;

ALTER TABLE matchups_with_byes RENAME TO matchups;
ALTER TABLE imported_matchup_scores_with_byes
  RENAME TO imported_matchup_scores;
ALTER TABLE matchup_overrides_with_byes RENAME TO matchup_overrides;

CREATE INDEX matchups_season_week_idx ON matchups(season_id, week);
