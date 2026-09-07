import type { Client, InStatement, Transaction } from "@libsql/client";
import { z } from "zod";

import type {
  CommitPlayerStatsImportInput,
  CommitRosterImportInput,
  CommitTransactionImportInput,
} from "@/application/ports/database-provider";
import {
  playerStatsImportSnapshotSchema,
  rosterImportSnapshotSchema,
  transactionImportSnapshotSchema,
} from "@/domain/schemas";
import type {
  ImportDataset,
  MatchupRosterDetail,
  MatchupRosterPlayer,
  MatchupRosterTeam,
  RelevantPlayer,
  SeasonDatasetStatus,
  SourceMapping,
} from "@/domain/types";

const relevantPlayerRowSchema = z.object({
  id: z.uuid(),
  externalId: z.string().trim().min(1),
});

const matchupRowSchema = z.object({
  matchupId: z.uuid(),
  seasonYear: z.number().int(),
  matchupPeriod: z.number().int().positive(),
  phase: z.enum(["regular", "playoff", "consolation"]),
});

const scoringPeriodRowSchema = z.object({
  scoringPeriod: z.number().int().positive(),
});

const rosterTeamRowSchema = z.object({
  scoringPeriod: z.number().int().positive(),
  franchiseId: z.uuid(),
  franchiseName: z.string().trim().min(1).nullable(),
  ownerName: z.string().trim().min(1).nullable(),
  matchupSide: z.enum(["home", "away"]),
  effectiveScore: z.number(),
  rosterState: z.enum(["provisional", "final"]),
});

const rosterPlayerRowSchema = z.object({
  scoringPeriod: z.number().int().positive(),
  franchiseId: z.uuid(),
  playerId: z.uuid(),
  playerKind: z.enum(["athlete", "team_defense"]),
  displayName: z.string().trim().min(1),
  lineupSlot: z.enum([
    "QB",
    "RB",
    "WR",
    "TE",
    "FLEX",
    "OP",
    "K",
    "DST",
    "BE",
    "IR",
  ]),
  rosterOrder: z.number().int().nonnegative(),
  actualFantasyPoints: z.number(),
  projectedFantasyPoints: z.number().nullable(),
});

const datasetStatusRowSchema = z.object({
  dataset: z.enum([
    "core",
    "rosters",
    "transactions",
    "player_stats",
  ]),
  status: z.enum(["running", "succeeded", "failed", "unavailable"]),
  completedAt: z.string().nullable(),
  message: z.string().nullable(),
});

function statementsBatch(
  transaction: Transaction,
  statements: InStatement[],
) {
  return statements.length > 0
    ? transaction.batch(statements)
    : Promise.resolve([]);
}

function playerStatements(
  players: CommitRosterImportInput["snapshot"]["players"],
): InStatement[] {
  return players.map((player) => ({
    sql: `
      INSERT INTO players (id, kind, display_name, first_name, last_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        display_name = excluded.display_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name
    `,
    args: [
      player.id,
      player.kind,
      player.displayName,
      player.firstName,
      player.lastName,
    ],
  }));
}

function nflTeamStatements(
  teams: CommitRosterImportInput["snapshot"]["nflTeams"],
): InStatement[] {
  return teams.map((team) => ({
    sql: `
      INSERT INTO nfl_teams (id, abbreviation, display_name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        abbreviation = excluded.abbreviation,
        display_name = excluded.display_name
    `,
    args: [team.id, team.abbreviation, team.displayName],
  }));
}

function sourceMappingStatements(
  mappings: SourceMapping[],
): InStatement[] {
  return mappings.map((mapping) => ({
    sql: `
      INSERT INTO source_mappings (
        provider,
        entity_type,
        canonical_id,
        external_id
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider, entity_type, external_id) DO UPDATE SET
        canonical_id = excluded.canonical_id
    `,
    args: [
      mapping.provider,
      mapping.entityType,
      mapping.canonicalId,
      mapping.externalId,
    ],
  }));
}

export async function replaceRosterData(
  transaction: Transaction,
  input: CommitRosterImportInput,
) {
  const snapshot = rosterImportSnapshotSchema.parse(input.snapshot);

  await statementsBatch(transaction, [
    ...playerStatements(snapshot.players),
    ...nflTeamStatements(snapshot.nflTeams),
    ...sourceMappingStatements(snapshot.sourceMappings),
  ]);
  await transaction.execute({
    sql: "DELETE FROM weekly_rosters WHERE season_id = ?",
    args: [snapshot.seasonId],
  });
  await transaction.execute({
    sql: "DELETE FROM player_nfl_team_ranges WHERE season_id = ?",
    args: [snapshot.seasonId],
  });
  await transaction.execute({
    sql: "DELETE FROM player_position_ranges WHERE season_id = ?",
    args: [snapshot.seasonId],
  });
  await statementsBatch(transaction, [
    ...snapshot.rosters.map((roster) => ({
      sql: `
        INSERT INTO weekly_rosters (
          season_id,
          scoring_period,
          franchise_id,
          state
        )
        VALUES (?, ?, ?, ?)
      `,
      args: [
        roster.seasonId,
        roster.scoringPeriod,
        roster.franchiseId,
        roster.state,
      ],
    })),
    ...snapshot.entries.map((entry) => ({
      sql: `
        INSERT INTO weekly_roster_entries (
          season_id,
          scoring_period,
          franchise_id,
          player_id,
          lineup_slot,
          roster_order,
          actual_fantasy_points,
          projected_fantasy_points
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        entry.seasonId,
        entry.scoringPeriod,
        entry.franchiseId,
        entry.playerId,
        entry.lineupSlot,
        entry.rosterOrder,
        entry.actualFantasyPoints,
        entry.projectedFantasyPoints,
      ],
    })),
    ...snapshot.nflTeamRanges.map((range) => ({
      sql: `
        INSERT INTO player_nfl_team_ranges (
          player_id,
          season_id,
          nfl_team_id,
          start_scoring_period,
          end_scoring_period
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        range.playerId,
        range.seasonId,
        range.nflTeamId,
        range.startScoringPeriod,
        range.endScoringPeriod,
      ],
    })),
    ...snapshot.positionRanges.map((range) => ({
      sql: `
        INSERT INTO player_position_ranges (
          player_id,
          season_id,
          position,
          start_scoring_period,
          end_scoring_period
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        range.playerId,
        range.seasonId,
        range.position,
        range.startScoringPeriod,
        range.endScoringPeriod,
      ],
    })),
  ]);
}

export async function replaceTransactionData(
  transaction: Transaction,
  input: CommitTransactionImportInput,
) {
  const snapshot = transactionImportSnapshotSchema.parse(input.snapshot);

  await statementsBatch(transaction, [
    ...playerStatements(snapshot.players),
    ...nflTeamStatements(snapshot.nflTeams),
    ...sourceMappingStatements(snapshot.sourceMappings),
  ]);
  await transaction.execute({
    sql: "DELETE FROM draft_picks WHERE season_id = ?",
    args: [snapshot.seasonId],
  });
  await transaction.execute({
    sql: "DELETE FROM fantasy_transactions WHERE season_id = ?",
    args: [snapshot.seasonId],
  });
  await statementsBatch(transaction, [
    ...snapshot.draftPicks.map((pick) => ({
      sql: `
        INSERT INTO draft_picks (
          id,
          season_id,
          franchise_id,
          player_id,
          round,
          round_pick,
          overall_pick,
          keeper,
          auction_bid
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        pick.id,
        pick.seasonId,
        pick.franchiseId,
        pick.playerId,
        pick.round,
        pick.roundPick,
        pick.overallPick,
        pick.keeper ? 1 : 0,
        pick.auctionBid,
      ],
    })),
    ...snapshot.transactions.map((transactionRecord) => ({
      sql: `
        INSERT INTO fantasy_transactions (
          id,
          season_id,
          scoring_period,
          kind,
          outcome,
          acting_franchise_id,
          proposed_at,
          processed_at,
          accepted_at,
          bid_amount,
          failure_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        transactionRecord.id,
        transactionRecord.seasonId,
        transactionRecord.scoringPeriod,
        transactionRecord.kind,
        transactionRecord.outcome,
        transactionRecord.actingFranchiseId,
        transactionRecord.proposedAt,
        transactionRecord.processedAt,
        transactionRecord.acceptedAt,
        transactionRecord.bidAmount,
        transactionRecord.failureReason,
      ],
    })),
    ...snapshot.transactionItems.map((item) => ({
      sql: `
        INSERT INTO fantasy_transaction_items (
          transaction_id,
          ordinal,
          player_id,
          action,
          from_franchise_id,
          to_franchise_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        item.transactionId,
        item.ordinal,
        item.playerId,
        item.action,
        item.fromFranchiseId,
        item.toFranchiseId,
      ],
    })),
  ]);
}

export async function replacePlayerStatsData(
  transaction: Transaction,
  input: CommitPlayerStatsImportInput,
) {
  const snapshot = playerStatsImportSnapshotSchema.parse(input.snapshot);

  await statementsBatch(transaction, [
    ...nflTeamStatements(snapshot.nflTeams),
    ...sourceMappingStatements(snapshot.sourceMappings),
  ]);
  await transaction.execute({
    sql: "DELETE FROM nfl_games WHERE season_year = ?",
    args: [snapshot.seasonYear],
  });
  await statementsBatch(transaction, [
    ...snapshot.games.map((game) => ({
      sql: `
        INSERT INTO nfl_games (
          id,
          season_year,
          season_type,
          week,
          starts_at,
          home_nfl_team_id,
          away_nfl_team_id,
          completed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        game.id,
        game.seasonYear,
        game.seasonType,
        game.week,
        game.startsAt,
        game.homeNflTeamId,
        game.awayNflTeamId,
        game.completed ? 1 : 0,
      ],
    })),
    ...snapshot.playerStats.map((stats) => ({
      sql: `
        INSERT INTO player_game_stats (
          player_id,
          nfl_game_id,
          nfl_team_id,
          passing_attempts,
          passing_completions,
          passing_yards,
          passing_touchdowns,
          passing_interceptions,
          rushing_attempts,
          rushing_yards,
          rushing_touchdowns,
          receptions,
          receiving_targets,
          receiving_yards,
          receiving_touchdowns,
          fumbles,
          fumbles_lost,
          passing_two_point_conversions,
          rushing_two_point_conversions,
          receiving_two_point_conversions,
          extra_points_made,
          extra_points_missed,
          made_field_goal_distances,
          missed_field_goal_distances
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?
        )
      `,
      args: [
        stats.playerId,
        stats.nflGameId,
        stats.nflTeamId,
        stats.passingAttempts,
        stats.passingCompletions,
        stats.passingYards,
        stats.passingTouchdowns,
        stats.passingInterceptions,
        stats.rushingAttempts,
        stats.rushingYards,
        stats.rushingTouchdowns,
        stats.receptions,
        stats.receivingTargets,
        stats.receivingYards,
        stats.receivingTouchdowns,
        stats.fumbles,
        stats.fumblesLost,
        stats.passingTwoPointConversions,
        stats.rushingTwoPointConversions,
        stats.receivingTwoPointConversions,
        stats.extraPointsMade,
        stats.extraPointsMissed,
        JSON.stringify(stats.madeFieldGoalDistances),
        JSON.stringify(stats.missedFieldGoalDistances),
      ],
    })),
  ]);
}

export async function listRelevantPlayers(
  client: Client,
  seasonYear: number,
): Promise<RelevantPlayer[]> {
  const result = await client.execute({
    sql: `
      SELECT DISTINCT
        players.id,
        source_mappings.external_id AS externalId
      FROM players
      INNER JOIN source_mappings
        ON source_mappings.canonical_id = players.id
        AND source_mappings.provider = 'espn'
        AND source_mappings.entity_type = 'player'
      WHERE players.kind = 'athlete'
        AND (
          EXISTS (
            SELECT 1
            FROM weekly_roster_entries
            INNER JOIN seasons
              ON seasons.id = weekly_roster_entries.season_id
            WHERE weekly_roster_entries.player_id = players.id
              AND seasons.year = ?
          )
          OR EXISTS (
            SELECT 1
            FROM draft_picks
            INNER JOIN seasons ON seasons.id = draft_picks.season_id
            WHERE draft_picks.player_id = players.id
              AND seasons.year = ?
          )
          OR EXISTS (
            SELECT 1
            FROM fantasy_transaction_items
            INNER JOIN fantasy_transactions
              ON fantasy_transactions.id =
                fantasy_transaction_items.transaction_id
            INNER JOIN seasons
              ON seasons.id = fantasy_transactions.season_id
            WHERE fantasy_transaction_items.player_id = players.id
              AND seasons.year = ?
          )
        )
      ORDER BY source_mappings.external_id
    `,
    args: [seasonYear, seasonYear, seasonYear],
  });

  return result.rows.map((row) => relevantPlayerRowSchema.parse(row));
}

export async function listSeasonDatasetStatuses(
  client: Client,
  seasonYear: number,
): Promise<SeasonDatasetStatus[]> {
  const result = await client.execute({
    sql: `
      WITH ranked AS (
        SELECT
          dataset,
          status,
          completed_at AS completedAt,
          error_message AS message,
          ROW_NUMBER() OVER (
            PARTITION BY dataset
            ORDER BY started_at DESC, id DESC
          ) AS row_number
        FROM import_runs
        WHERE season_year = ?
      )
      SELECT dataset, status, completedAt, message
      FROM ranked
      WHERE row_number = 1
    `,
    args: [seasonYear],
  });
  const byDataset = new Map(
    result.rows.map((row) => {
      const parsed = datasetStatusRowSchema.parse(row);
      return [parsed.dataset, parsed] as const;
    }),
  );
  const datasets: ImportDataset[] = [
    "core",
    "rosters",
    "transactions",
    "player_stats",
  ];

  return datasets.map(
    (dataset): SeasonDatasetStatus =>
      byDataset.get(dataset) ?? {
        dataset,
        status: "not_imported",
        completedAt: null,
        message: null,
      },
  );
}

export async function getMatchupRosterDetail(
  client: Client,
  seasonYear: number,
  matchupId: string,
): Promise<MatchupRosterDetail | null> {
  const matchupResult = await client.execute({
    sql: `
      SELECT
        matchups.id AS matchupId,
        seasons.year AS seasonYear,
        matchups.week AS matchupPeriod,
        matchups.phase
      FROM matchups
      INNER JOIN seasons ON seasons.id = matchups.season_id
      WHERE seasons.year = ? AND matchups.id = ?
    `,
    args: [seasonYear, matchupId],
  });

  if (matchupResult.rows.length === 0) {
    return null;
  }

  const matchup = matchupRowSchema.parse(matchupResult.rows[0]);
  const periodResult = await client.execute({
    sql: `
      SELECT scoring_period AS scoringPeriod
      FROM matchup_scoring_periods
      WHERE matchup_id = ?
      UNION
      SELECT week AS scoringPeriod
      FROM matchups
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM matchup_scoring_periods
          WHERE matchup_id = ?
        )
      ORDER BY scoringPeriod
    `,
    args: [matchupId, matchupId, matchupId],
  });
  const periods = periodResult.rows.map(
    (row) => scoringPeriodRowSchema.parse(row).scoringPeriod,
  );
  const teamResult = await client.execute({
    sql: `
      SELECT
        weekly_rosters.scoring_period AS scoringPeriod,
        weekly_rosters.franchise_id AS franchiseId,
        season_names.name AS franchiseName,
        franchises.owner_name AS ownerName,
        CASE
          WHEN matchups.home_franchise_id = weekly_rosters.franchise_id
            THEN 'home'
          ELSE 'away'
        END AS matchupSide,
        imported_matchup_scores.score
          + COALESCE(matchup_overrides.score_adjustment, 0)
          AS effectiveScore,
        weekly_rosters.state AS rosterState
      FROM matchups
      INNER JOIN seasons ON seasons.id = matchups.season_id
      INNER JOIN weekly_rosters
        ON weekly_rosters.season_id = matchups.season_id
        AND weekly_rosters.scoring_period IN (
          SELECT scoring_period
          FROM matchup_scoring_periods
          WHERE matchup_id = matchups.id
          UNION
          SELECT matchups.week
          WHERE NOT EXISTS (
            SELECT 1
            FROM matchup_scoring_periods
            WHERE matchup_id = matchups.id
          )
        )
        AND weekly_rosters.franchise_id IN (
          matchups.home_franchise_id,
          matchups.away_franchise_id
        )
      INNER JOIN franchises
        ON franchises.id = weekly_rosters.franchise_id
      LEFT JOIN season_franchise_names AS season_names
        ON season_names.season_id = matchups.season_id
        AND season_names.franchise_id = weekly_rosters.franchise_id
      INNER JOIN imported_matchup_scores
        ON imported_matchup_scores.matchup_id = matchups.id
        AND imported_matchup_scores.franchise_id =
          weekly_rosters.franchise_id
      LEFT JOIN matchup_overrides
        ON matchup_overrides.matchup_id = matchups.id
        AND matchup_overrides.franchise_id =
          weekly_rosters.franchise_id
      WHERE seasons.year = ? AND matchups.id = ?
      ORDER BY
        weekly_rosters.scoring_period,
        CASE
          WHEN matchups.home_franchise_id = weekly_rosters.franchise_id
            THEN 0
          ELSE 1
        END
    `,
    args: [seasonYear, matchupId],
  });
  const playerResult = await client.execute({
    sql: `
      SELECT
        weekly_roster_entries.scoring_period AS scoringPeriod,
        weekly_roster_entries.franchise_id AS franchiseId,
        players.id AS playerId,
        players.kind AS playerKind,
        players.display_name AS displayName,
        weekly_roster_entries.lineup_slot AS lineupSlot,
        weekly_roster_entries.roster_order AS rosterOrder,
        weekly_roster_entries.actual_fantasy_points AS actualFantasyPoints,
        weekly_roster_entries.projected_fantasy_points
          AS projectedFantasyPoints
      FROM weekly_roster_entries
      INNER JOIN players ON players.id = weekly_roster_entries.player_id
      INNER JOIN matchups
        ON matchups.season_id = weekly_roster_entries.season_id
        AND weekly_roster_entries.scoring_period IN (
          SELECT scoring_period
          FROM matchup_scoring_periods
          WHERE matchup_id = matchups.id
          UNION
          SELECT matchups.week
          WHERE NOT EXISTS (
            SELECT 1
            FROM matchup_scoring_periods
            WHERE matchup_id = matchups.id
          )
        )
        AND weekly_roster_entries.franchise_id IN (
          matchups.home_franchise_id,
          matchups.away_franchise_id
        )
      INNER JOIN seasons ON seasons.id = matchups.season_id
      WHERE seasons.year = ? AND matchups.id = ?
      ORDER BY
        weekly_roster_entries.scoring_period,
        weekly_roster_entries.franchise_id,
        CASE weekly_roster_entries.lineup_slot
          WHEN 'QB' THEN 0
          WHEN 'RB' THEN 1
          WHEN 'WR' THEN 2
          WHEN 'TE' THEN 3
          WHEN 'FLEX' THEN 4
          WHEN 'OP' THEN 5
          WHEN 'K' THEN 6
          WHEN 'DST' THEN 7
          WHEN 'BE' THEN 8
          WHEN 'IR' THEN 9
        END,
        weekly_roster_entries.roster_order
    `,
    args: [seasonYear, matchupId],
  });
  const teams = teamResult.rows.map((row) => rosterTeamRowSchema.parse(row));
  const players = playerResult.rows.map((row) =>
    rosterPlayerRowSchema.parse(row),
  );

  return {
    ...matchup,
    periods: periods.map((scoringPeriod) => ({
      scoringPeriod,
      teams: teams
        .filter((team) => team.scoringPeriod === scoringPeriod)
        .map(
          (team): MatchupRosterTeam => ({
            franchiseId: team.franchiseId,
            franchiseName: team.franchiseName,
            ownerName: team.ownerName,
            matchupSide: team.matchupSide,
            effectiveScore: team.effectiveScore,
            rosterState: team.rosterState,
            players: players
              .filter(
                (player) =>
                  player.scoringPeriod === scoringPeriod &&
                  player.franchiseId === team.franchiseId,
              )
              .map(
                (player): MatchupRosterPlayer => ({
                  playerId: player.playerId,
                  playerKind: player.playerKind,
                  displayName: player.displayName,
                  lineupSlot: player.lineupSlot,
                  rosterOrder: player.rosterOrder,
                  actualFantasyPoints: player.actualFantasyPoints,
                  projectedFantasyPoints:
                    player.projectedFantasyPoints,
                }),
              ),
          }),
        ),
    })),
  };
}
