CREATE TABLE source_mappings_new (
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (
      entity_type IN (
        'league',
        'season',
        'franchise',
        'matchup',
        'player',
        'nfl_team',
        'nfl_game',
        'transaction',
        'draft_pick'
      )
    ),
  canonical_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  PRIMARY KEY (provider, entity_type, external_id)
);

INSERT INTO source_mappings_new (
  provider,
  entity_type,
  canonical_id,
  external_id
)
SELECT
  provider,
  entity_type,
  canonical_id,
  external_id
FROM source_mappings;

DROP TABLE source_mappings;
ALTER TABLE source_mappings_new RENAME TO source_mappings;

CREATE INDEX source_mappings_canonical_idx
  ON source_mappings(provider, entity_type, canonical_id);

CREATE TABLE import_runs_new (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('import', 'refresh')),
  dataset TEXT NOT NULL
    CHECK (dataset IN ('core', 'rosters', 'transactions', 'player_stats')),
  season_year INTEGER NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed', 'unavailable')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  CHECK (
    (status = 'running' AND completed_at IS NULL AND error_message IS NULL)
    OR
    (status = 'succeeded' AND completed_at IS NOT NULL AND error_message IS NULL)
    OR
    (
      status IN ('failed', 'unavailable')
      AND completed_at IS NOT NULL
      AND error_message IS NOT NULL
    )
  )
);

INSERT INTO import_runs_new (
  id,
  provider,
  operation,
  dataset,
  season_year,
  status,
  started_at,
  completed_at,
  error_message
)
SELECT
  id,
  provider,
  operation,
  'core',
  season_year,
  status,
  started_at,
  completed_at,
  error_message
FROM import_runs;

DROP TABLE import_runs;
ALTER TABLE import_runs_new RENAME TO import_runs;

CREATE INDEX import_runs_season_started_idx
  ON import_runs(season_year, started_at);

CREATE INDEX import_runs_season_dataset_started_idx
  ON import_runs(season_year, dataset, started_at DESC);

CREATE TABLE matchup_scoring_periods (
  matchup_id TEXT NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
  scoring_period INTEGER NOT NULL CHECK (scoring_period > 0),
  PRIMARY KEY (matchup_id, scoring_period)
);

CREATE INDEX matchup_scoring_periods_period_idx
  ON matchup_scoring_periods(scoring_period, matchup_id);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('athlete', 'team_defense')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  first_name TEXT,
  last_name TEXT
);

CREATE TABLE nfl_teams (
  id TEXT PRIMARY KEY,
  abbreviation TEXT NOT NULL CHECK (length(trim(abbreviation)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
);

CREATE TABLE weekly_rosters (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  scoring_period INTEGER NOT NULL CHECK (scoring_period > 0),
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  state TEXT NOT NULL CHECK (state IN ('provisional', 'final')),
  PRIMARY KEY (season_id, scoring_period, franchise_id)
);

CREATE INDEX weekly_rosters_season_period_idx
  ON weekly_rosters(season_id, scoring_period);

CREATE TABLE weekly_roster_entries (
  season_id TEXT NOT NULL,
  scoring_period INTEGER NOT NULL,
  franchise_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  lineup_slot TEXT NOT NULL
    CHECK (
      lineup_slot IN (
        'QB',
        'RB',
        'WR',
        'TE',
        'FLEX',
        'OP',
        'K',
        'DST',
        'BE',
        'IR'
      )
    ),
  roster_order INTEGER NOT NULL CHECK (roster_order >= 0),
  actual_fantasy_points REAL NOT NULL,
  projected_fantasy_points REAL,
  PRIMARY KEY (season_id, scoring_period, franchise_id, player_id),
  FOREIGN KEY (season_id, scoring_period, franchise_id)
    REFERENCES weekly_rosters(season_id, scoring_period, franchise_id)
    ON DELETE CASCADE
);

CREATE INDEX weekly_roster_entries_player_idx
  ON weekly_roster_entries(player_id, season_id, scoring_period);

CREATE TABLE player_nfl_team_ranges (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  nfl_team_id TEXT NOT NULL REFERENCES nfl_teams(id),
  start_scoring_period INTEGER NOT NULL CHECK (start_scoring_period > 0),
  end_scoring_period INTEGER NOT NULL
    CHECK (end_scoring_period >= start_scoring_period),
  PRIMARY KEY (
    player_id,
    season_id,
    nfl_team_id,
    start_scoring_period
  )
);

CREATE TABLE player_position_ranges (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DST')),
  start_scoring_period INTEGER NOT NULL CHECK (start_scoring_period > 0),
  end_scoring_period INTEGER NOT NULL
    CHECK (end_scoring_period >= start_scoring_period),
  PRIMARY KEY (
    player_id,
    season_id,
    position,
    start_scoring_period
  )
);

CREATE TABLE draft_picks (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  round INTEGER NOT NULL CHECK (round > 0),
  round_pick INTEGER NOT NULL CHECK (round_pick > 0),
  overall_pick INTEGER NOT NULL CHECK (overall_pick > 0),
  keeper INTEGER NOT NULL CHECK (keeper IN (0, 1)),
  auction_bid REAL CHECK (auction_bid IS NULL OR auction_bid >= 0),
  UNIQUE (season_id, overall_pick)
);

CREATE TABLE fantasy_transactions (
  id TEXT PRIMARY KEY,
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  scoring_period INTEGER NOT NULL CHECK (scoring_period > 0),
  kind TEXT NOT NULL
    CHECK (kind IN ('free_agent', 'waiver', 'trade', 'administrative')),
  outcome TEXT NOT NULL CHECK (outcome IN ('executed', 'failed')),
  acting_franchise_id TEXT REFERENCES franchises(id),
  proposed_at TEXT,
  processed_at TEXT,
  accepted_at TEXT,
  bid_amount REAL CHECK (bid_amount IS NULL OR bid_amount >= 0),
  failure_reason TEXT
    CHECK (
      failure_reason IS NULL
      OR failure_reason IN (
        'auction_budget_exceeded',
        'invalid_player_source',
        'invalid_ir_slot',
        'matchup_acquisition_limit',
        'player_already_dropped',
        'roster_limit',
        'roster_lock'
      )
    ),
  CHECK (
    (outcome = 'executed' AND failure_reason IS NULL)
    OR (outcome = 'failed' AND failure_reason IS NOT NULL)
  )
);

CREATE INDEX fantasy_transactions_season_period_idx
  ON fantasy_transactions(season_id, scoring_period);

CREATE TABLE fantasy_transaction_items (
  transaction_id TEXT NOT NULL
    REFERENCES fantasy_transactions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  player_id TEXT NOT NULL REFERENCES players(id),
  action TEXT NOT NULL CHECK (action IN ('add', 'drop', 'trade')),
  from_franchise_id TEXT REFERENCES franchises(id),
  to_franchise_id TEXT REFERENCES franchises(id),
  PRIMARY KEY (transaction_id, ordinal)
);

CREATE TABLE nfl_games (
  id TEXT PRIMARY KEY,
  season_year INTEGER NOT NULL REFERENCES seasons(year) ON DELETE CASCADE,
  season_type INTEGER NOT NULL CHECK (season_type > 0),
  week INTEGER NOT NULL CHECK (week > 0),
  starts_at TEXT NOT NULL,
  home_nfl_team_id TEXT NOT NULL REFERENCES nfl_teams(id),
  away_nfl_team_id TEXT NOT NULL REFERENCES nfl_teams(id),
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  CHECK (home_nfl_team_id <> away_nfl_team_id)
);

CREATE INDEX nfl_games_season_week_idx
  ON nfl_games(season_year, week);

CREATE TABLE player_game_stats (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  nfl_game_id TEXT NOT NULL REFERENCES nfl_games(id) ON DELETE CASCADE,
  nfl_team_id TEXT NOT NULL REFERENCES nfl_teams(id),
  passing_attempts INTEGER NOT NULL CHECK (passing_attempts >= 0),
  passing_completions INTEGER NOT NULL CHECK (passing_completions >= 0),
  passing_yards INTEGER NOT NULL,
  passing_touchdowns INTEGER NOT NULL CHECK (passing_touchdowns >= 0),
  passing_interceptions INTEGER NOT NULL CHECK (passing_interceptions >= 0),
  rushing_attempts INTEGER NOT NULL CHECK (rushing_attempts >= 0),
  rushing_yards INTEGER NOT NULL,
  rushing_touchdowns INTEGER NOT NULL CHECK (rushing_touchdowns >= 0),
  receptions INTEGER NOT NULL CHECK (receptions >= 0),
  receiving_targets INTEGER NOT NULL CHECK (receiving_targets >= 0),
  receiving_yards INTEGER NOT NULL,
  receiving_touchdowns INTEGER NOT NULL CHECK (receiving_touchdowns >= 0),
  fumbles INTEGER NOT NULL CHECK (fumbles >= 0),
  fumbles_lost INTEGER NOT NULL CHECK (fumbles_lost >= 0),
  passing_two_point_conversions INTEGER NOT NULL
    CHECK (passing_two_point_conversions >= 0),
  rushing_two_point_conversions INTEGER NOT NULL
    CHECK (rushing_two_point_conversions >= 0),
  receiving_two_point_conversions INTEGER NOT NULL
    CHECK (receiving_two_point_conversions >= 0),
  extra_points_made INTEGER NOT NULL CHECK (extra_points_made >= 0),
  extra_points_missed INTEGER NOT NULL CHECK (extra_points_missed >= 0),
  made_field_goal_distances TEXT NOT NULL
    CHECK (json_valid(made_field_goal_distances)),
  missed_field_goal_distances TEXT NOT NULL
    CHECK (json_valid(missed_field_goal_distances)),
  PRIMARY KEY (player_id, nfl_game_id)
);
