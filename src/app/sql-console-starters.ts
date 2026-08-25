export interface SqlStarterQuery {
  id: string;
  label: string;
  statement: string;
  parameters: string;
}

export const sqlStarterQueries: SqlStarterQuery[] = [
  {
    id: "seasons",
    label: "Imported seasons",
    statement: `SELECT
  year,
  team_count,
  regular_season_start_week,
  regular_season_end_week
FROM seasons
ORDER BY year DESC;`,
    parameters: "[]",
  },
  {
    id: "standings",
    label: "ANP standings by season",
    statement: `SELECT
  standings.season_year,
  standings.qualification_rank,
  display_names.display_name,
  standings.franchise_id,
  standings.weeks_played,
  standings.total_nascar_points,
  standings.total_head_to_head_bonus,
  standings.total_adjusted_nascar_points
FROM regular_season_anp_standings AS standings
LEFT JOIN franchise_display_names AS display_names
  ON display_names.franchise_id = standings.franchise_id
WHERE standings.season_year = ?
ORDER BY standings.qualification_rank;`,
    parameters: "[2017]",
  },
  {
    id: "weekly-results",
    label: "Weekly scoring by season and week",
    statement: `SELECT
  season_year,
  week,
  matchup_id,
  franchise_id,
  effective_score,
  nascar_points,
  head_to_head_bonus,
  adjusted_nascar_points
FROM weekly_adjusted_nascar_points
WHERE season_year = ? AND week = ?
ORDER BY matchup_id, effective_score DESC;`,
    parameters: "[2017, 1]",
  },
  {
    id: "adjustments",
    label: "Manual score adjustments",
    statement: `SELECT
  seasons.year AS season_year,
  matchups.week,
  matchup_overrides.matchup_id,
  matchup_overrides.franchise_id,
  matchup_overrides.score_adjustment,
  matchup_overrides.reason,
  matchup_overrides.created_at
FROM matchup_overrides
INNER JOIN matchups ON matchups.id = matchup_overrides.matchup_id
INNER JOIN seasons ON seasons.id = matchups.season_id
ORDER BY seasons.year DESC, matchups.week;`,
    parameters: "[]",
  },
];
