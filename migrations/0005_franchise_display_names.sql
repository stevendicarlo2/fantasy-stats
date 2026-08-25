CREATE TABLE franchise_display_names (
  franchise_id TEXT PRIMARY KEY REFERENCES franchises(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0)
);
