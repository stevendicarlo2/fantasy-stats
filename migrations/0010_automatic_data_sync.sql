ALTER TABLE seasons
ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0
  CHECK (is_active IN (0, 1));

ALTER TABLE import_runs
ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'legacy'
  CHECK (trigger_source IN ('legacy', 'manual', 'automatic', 'cli'));

CREATE TABLE sync_leases (
  season_year INTEGER NOT NULL,
  dataset TEXT NOT NULL
    CHECK (dataset IN ('core', 'rosters', 'transactions', 'player_stats')),
  import_run_id TEXT NOT NULL UNIQUE REFERENCES import_runs(id),
  owner_token TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (season_year, dataset)
);

CREATE INDEX sync_leases_expiry_idx ON sync_leases(expires_at);
