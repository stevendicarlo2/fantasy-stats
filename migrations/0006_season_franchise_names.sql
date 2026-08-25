CREATE TABLE season_franchise_names (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  franchise_id TEXT NOT NULL REFERENCES franchises(id),
  name TEXT NOT NULL,
  PRIMARY KEY (season_id, franchise_id),
  FOREIGN KEY (season_id, franchise_id)
    REFERENCES season_franchises(season_id, franchise_id)
);

INSERT INTO season_franchise_names (season_id, franchise_id, name)
SELECT
  season_franchises.season_id,
  season_franchises.franchise_id,
  MIN(franchise_names.name)
FROM season_franchises
INNER JOIN franchise_names
  ON franchise_names.franchise_id = season_franchises.franchise_id
GROUP BY
  season_franchises.season_id,
  season_franchises.franchise_id;
