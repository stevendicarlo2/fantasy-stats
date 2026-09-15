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
    parameters: "{}",
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
WHERE standings.season_year = $year
ORDER BY standings.qualification_rank;`,
    parameters: '{"year":2017}',
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
WHERE season_year = $year AND week = $week
ORDER BY matchup_id, effective_score DESC;`,
    parameters: '{"year":2017,"week":1}',
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
    parameters: "{}",
  },
  {
    id: "head-to-head",
    label: "Head-to-head matchup history",
    statement: `SELECT
  first_score.season_year,
  first_score.week,
  first_score.phase,
  first_name.display_name AS first_person,
  first_score.effective_score AS first_score,
  second_name.display_name AS second_person,
  second_score.effective_score AS second_score,
  CASE
    WHEN first_score.effective_score > second_score.effective_score THEN first_name.display_name || ' won'
    WHEN first_score.effective_score < second_score.effective_score THEN second_name.display_name || ' won'
    ELSE 'Tie'
  END AS result
FROM
  weekly_adjusted_nascar_points AS first_score
  INNER JOIN weekly_adjusted_nascar_points AS second_score ON second_score.matchup_id = first_score.matchup_id
  AND second_score.franchise_id = first_score.opponent_franchise_id
  INNER JOIN franchise_display_names AS first_name ON first_name.franchise_id = first_score.franchise_id
  INNER JOIN franchise_display_names AS second_name ON second_name.franchise_id = second_score.franchise_id
WHERE
  first_name.display_name = $first_person
  AND second_name.display_name = $second_person
ORDER BY
  first_score.season_year,
  first_score.week;`,
    parameters: '{"first_person":"Steven","second_person":"Mike"}',
  },
];
