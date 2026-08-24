PRAGMA foreign_keys = ON;

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE seasons (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  year INTEGER NOT NULL UNIQUE,
  team_count INTEGER NOT NULL CHECK (team_count >= 2),
  regular_season_start_week INTEGER NOT NULL
    CHECK (regular_season_start_week > 0),
  regular_season_end_week INTEGER NOT NULL
    CHECK (regular_season_end_week >= regular_season_start_week)
);

CREATE TABLE franchises (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  owner_name TEXT
);

CREATE TABLE season_franchises (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  PRIMARY KEY (season_id, franchise_id)
);

CREATE TABLE franchise_names (
  franchise_id TEXT NOT NULL REFERENCES franchises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  PRIMARY KEY (franchise_id, name)
);

CREATE TABLE matchups (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  week INTEGER NOT NULL CHECK (week > 0),
  phase TEXT NOT NULL CHECK (phase IN ('regular', 'playoff', 'consolation')),
  home_franchise_id TEXT NOT NULL REFERENCES franchises(id),
  away_franchise_id TEXT NOT NULL REFERENCES franchises(id),
  CHECK (home_franchise_id <> away_franchise_id)
);

CREATE INDEX matchups_season_week_idx ON matchups(season_id, week);

CREATE TABLE imported_matchup_scores (
  matchup_id TEXT NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  score REAL NOT NULL,
  PRIMARY KEY (matchup_id, franchise_id)
);

CREATE TABLE source_mappings (
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('league', 'season', 'franchise', 'matchup')),
  canonical_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  PRIMARY KEY (provider, entity_type, external_id)
);

CREATE INDEX source_mappings_canonical_idx
  ON source_mappings(provider, entity_type, canonical_id);

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('import', 'refresh')),
  season_year INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  CHECK (
    (status = 'running' AND completed_at IS NULL AND error_message IS NULL)
    OR
    (status = 'succeeded' AND completed_at IS NOT NULL AND error_message IS NULL)
    OR
    (status = 'failed' AND completed_at IS NOT NULL AND error_message IS NOT NULL)
  )
);

CREATE INDEX import_runs_season_started_idx
  ON import_runs(season_year, started_at);

CREATE TABLE matchup_overrides (
  id TEXT PRIMARY KEY,
  matchup_id TEXT NOT NULL REFERENCES matchups(id),
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  score_adjustment REAL NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (matchup_id, franchise_id)
);
