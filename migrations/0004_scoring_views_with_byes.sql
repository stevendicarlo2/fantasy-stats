CREATE VIEW effective_matchup_scores AS
SELECT
  seasons.id AS season_id,
  seasons.year AS season_year,
  matchups.id AS matchup_id,
  matchups.week,
  matchups.phase,
  imported_matchup_scores.franchise_id,
  CASE
    WHEN imported_matchup_scores.franchise_id = matchups.home_franchise_id
      THEN matchups.away_franchise_id
    ELSE matchups.home_franchise_id
  END AS opponent_franchise_id,
  imported_matchup_scores.score AS imported_score,
  COALESCE(matchup_overrides.score_adjustment, 0.0) AS score_adjustment,
  ROUND(
    imported_matchup_scores.score
      + COALESCE(matchup_overrides.score_adjustment, 0.0),
    2
  ) AS effective_score
FROM imported_matchup_scores
INNER JOIN matchups ON matchups.id = imported_matchup_scores.matchup_id
INNER JOIN seasons ON seasons.id = matchups.season_id
LEFT JOIN matchup_overrides
  ON matchup_overrides.matchup_id = imported_matchup_scores.matchup_id
  AND matchup_overrides.franchise_id
    = imported_matchup_scores.franchise_id;

CREATE VIEW weekly_nascar_points AS
WITH ranked_scores AS (
  SELECT
    effective_matchup_scores.*,
    seasons.team_count,
    RANK() OVER (
      PARTITION BY
        effective_matchup_scores.season_id,
        effective_matchup_scores.week
      ORDER BY effective_matchup_scores.effective_score
    ) AS first_rank,
    COUNT(*) OVER (
      PARTITION BY
        effective_matchup_scores.season_id,
        effective_matchup_scores.week,
        effective_matchup_scores.effective_score
    ) AS tie_count
  FROM effective_matchup_scores
  INNER JOIN seasons ON seasons.id = effective_matchup_scores.season_id
)
SELECT
  season_id,
  season_year,
  matchup_id,
  week,
  phase,
  franchise_id,
  opponent_franchise_id,
  imported_score,
  score_adjustment,
  effective_score,
  team_count,
  first_rank + ((tie_count - 1) / 2.0) AS nascar_points
FROM ranked_scores;

CREATE VIEW weekly_adjusted_nascar_points AS
SELECT
  team_scores.season_id,
  team_scores.season_year,
  team_scores.matchup_id,
  team_scores.week,
  team_scores.phase,
  team_scores.franchise_id,
  team_scores.opponent_franchise_id,
  team_scores.imported_score,
  team_scores.score_adjustment,
  team_scores.effective_score,
  team_scores.nascar_points,
  CASE
    WHEN opponent_scores.effective_score IS NULL THEN NULL
    WHEN team_scores.effective_score > opponent_scores.effective_score
      THEN team_scores.team_count
    WHEN team_scores.effective_score = opponent_scores.effective_score
      THEN team_scores.team_count / 2.0
    ELSE 0.0
  END AS head_to_head_bonus,
  CASE
    WHEN opponent_scores.effective_score IS NULL THEN NULL
    ELSE team_scores.nascar_points
      + CASE
          WHEN team_scores.effective_score > opponent_scores.effective_score
            THEN team_scores.team_count
          WHEN team_scores.effective_score = opponent_scores.effective_score
            THEN team_scores.team_count / 2.0
          ELSE 0.0
        END
  END AS adjusted_nascar_points
FROM weekly_nascar_points AS team_scores
LEFT JOIN effective_matchup_scores AS opponent_scores
  ON opponent_scores.matchup_id = team_scores.matchup_id
  AND opponent_scores.franchise_id = team_scores.opponent_franchise_id;

CREATE VIEW regular_season_anp_standings AS
WITH totals AS (
  SELECT
    weekly_adjusted_nascar_points.season_id,
    weekly_adjusted_nascar_points.season_year,
    weekly_adjusted_nascar_points.franchise_id,
    COUNT(*) AS weeks_played,
    SUM(weekly_adjusted_nascar_points.nascar_points)
      AS total_nascar_points,
    SUM(weekly_adjusted_nascar_points.head_to_head_bonus)
      AS total_head_to_head_bonus,
    SUM(weekly_adjusted_nascar_points.adjusted_nascar_points)
      AS total_adjusted_nascar_points
  FROM weekly_adjusted_nascar_points
  WHERE weekly_adjusted_nascar_points.phase = 'regular'
  GROUP BY
    weekly_adjusted_nascar_points.season_id,
    weekly_adjusted_nascar_points.season_year,
    weekly_adjusted_nascar_points.franchise_id
)
SELECT
  totals.*,
  RANK() OVER (
    PARTITION BY totals.season_id
    ORDER BY totals.total_adjusted_nascar_points DESC
  ) AS qualification_rank
FROM totals;
