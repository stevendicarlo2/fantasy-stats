export type CanonicalId = string;
export type IsoDateTime = string;

export interface League {
  id: CanonicalId;
  name: string;
}

export interface Season {
  id: CanonicalId;
  leagueId: CanonicalId;
  year: number;
  teamCount: number;
  playoffTeamCount: number | null;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
}

export interface Franchise {
  id: CanonicalId;
  leagueId: CanonicalId;
  ownerName: string | null;
}

export interface FranchiseName {
  franchiseId: CanonicalId;
  name: string;
}

export interface FranchiseDisplayName {
  franchiseId: CanonicalId;
  displayName: string;
}

export type MatchupPhase = "regular" | "playoff" | "consolation";

export interface Matchup {
  id: CanonicalId;
  seasonId: CanonicalId;
  week: number;
  phase: MatchupPhase;
  homeFranchiseId: CanonicalId;
  awayFranchiseId: CanonicalId | null;
}

export interface MatchupScoringPeriod {
  matchupId: CanonicalId;
  scoringPeriod: number;
}

export interface ImportedMatchupScore {
  matchupId: CanonicalId;
  franchiseId: CanonicalId;
  score: number;
}

export interface MatchupOverride {
  id: CanonicalId;
  matchupId: CanonicalId;
  franchiseId: CanonicalId;
  scoreAdjustment: number;
  reason: string;
  createdAt: IsoDateTime;
}

export type SourceEntityType =
  | "league"
  | "season"
  | "franchise"
  | "matchup"
  | "player"
  | "nfl_team"
  | "nfl_game"
  | "transaction"
  | "draft_pick";

export interface SourceMapping {
  provider: string;
  entityType: SourceEntityType;
  canonicalId: CanonicalId;
  externalId: string;
}

export type ImportOperation = "import" | "refresh";
export type ImportDataset =
  | "core"
  | "rosters"
  | "transactions"
  | "player_stats";
export type ImportRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "unavailable";

export interface ImportRun {
  id: CanonicalId;
  provider: string;
  operation: ImportOperation;
  dataset?: ImportDataset;
  seasonYear: number;
  status: ImportRunStatus;
  startedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  errorMessage: string | null;
}

export interface SeasonImportSnapshot {
  league: League;
  season: Season;
  franchises: Franchise[];
  franchiseNames: FranchiseName[];
  seasonFranchiseNames: FranchiseName[];
  matchups: Matchup[];
  matchupScoringPeriods?: MatchupScoringPeriod[];
  scores: ImportedMatchupScore[];
  sourceMappings: SourceMapping[];
}

export type PlayerKind = "athlete" | "team_defense";

export interface Player {
  id: CanonicalId;
  kind: PlayerKind;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

export interface NflTeam {
  id: CanonicalId;
  abbreviation: string;
  displayName: string;
}

export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST";

export type LineupSlot =
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "FLEX"
  | "OP"
  | "K"
  | "DST"
  | "BE"
  | "IR";

export type RosterSnapshotState = "provisional" | "final";

export interface WeeklyRosterSnapshot {
  seasonId: CanonicalId;
  scoringPeriod: number;
  franchiseId: CanonicalId;
  state: RosterSnapshotState;
}

export interface WeeklyRosterEntry {
  seasonId: CanonicalId;
  scoringPeriod: number;
  franchiseId: CanonicalId;
  playerId: CanonicalId;
  lineupSlot: LineupSlot;
  rosterOrder: number;
  actualFantasyPoints: number;
  projectedFantasyPoints: number | null;
}

export interface PlayerNflTeamRange {
  playerId: CanonicalId;
  seasonId: CanonicalId;
  nflTeamId: CanonicalId;
  startScoringPeriod: number;
  endScoringPeriod: number;
}

export interface PlayerPositionRange {
  playerId: CanonicalId;
  seasonId: CanonicalId;
  position: PlayerPosition;
  startScoringPeriod: number;
  endScoringPeriod: number;
}

export interface RosterImportSnapshot {
  seasonId: CanonicalId;
  seasonYear: number;
  players: Player[];
  nflTeams: NflTeam[];
  rosters: WeeklyRosterSnapshot[];
  entries: WeeklyRosterEntry[];
  nflTeamRanges: PlayerNflTeamRange[];
  positionRanges: PlayerPositionRange[];
  sourceMappings: SourceMapping[];
}

export interface DraftPick {
  id: CanonicalId;
  seasonId: CanonicalId;
  franchiseId: CanonicalId;
  playerId: CanonicalId;
  round: number;
  roundPick: number;
  overallPick: number;
  keeper: boolean;
  auctionBid: number | null;
}

export type FantasyTransactionKind =
  | "free_agent"
  | "waiver"
  | "trade"
  | "administrative";
export type FantasyTransactionOutcome = "executed" | "failed";
export type FantasyTransactionFailureReason =
  | "auction_budget_exceeded"
  | "invalid_player_source"
  | "invalid_ir_slot"
  | "matchup_acquisition_limit"
  | "player_already_dropped"
  | "roster_limit"
  | "roster_lock";

export interface FantasyTransaction {
  id: CanonicalId;
  seasonId: CanonicalId;
  scoringPeriod: number;
  kind: FantasyTransactionKind;
  outcome: FantasyTransactionOutcome;
  actingFranchiseId: CanonicalId | null;
  proposedAt: IsoDateTime | null;
  processedAt: IsoDateTime | null;
  acceptedAt: IsoDateTime | null;
  bidAmount: number | null;
  failureReason: FantasyTransactionFailureReason | null;
}

export type FantasyTransactionAction = "add" | "drop" | "trade";

export interface FantasyTransactionItem {
  transactionId: CanonicalId;
  ordinal: number;
  playerId: CanonicalId;
  action: FantasyTransactionAction;
  fromFranchiseId: CanonicalId | null;
  toFranchiseId: CanonicalId | null;
}

export interface TransactionImportSnapshot {
  seasonId: CanonicalId;
  seasonYear: number;
  players: Player[];
  nflTeams: NflTeam[];
  draftPicks: DraftPick[];
  transactions: FantasyTransaction[];
  transactionItems: FantasyTransactionItem[];
  sourceMappings: SourceMapping[];
}

export interface NflGame {
  id: CanonicalId;
  seasonYear: number;
  gameType: number;
  week: number;
  startsAt: IsoDateTime;
  homeNflTeamId: CanonicalId;
  awayNflTeamId: CanonicalId;
  completed: boolean;
}

export interface PlayerGameStats {
  playerId: CanonicalId;
  nflGameId: CanonicalId;
  nflTeamId: CanonicalId;
  passingAttempts: number;
  passingCompletions: number;
  passingYards: number;
  passingTouchdowns: number;
  passingInterceptions: number;
  rushingAttempts: number;
  rushingYards: number;
  rushingTouchdowns: number;
  receptions: number;
  receivingTargets: number;
  receivingYards: number;
  receivingTouchdowns: number;
  fumbles: number;
  fumblesLost: number;
  passingTwoPointConversions: number;
  rushingTwoPointConversions: number;
  receivingTwoPointConversions: number;
  extraPointsMade: number;
  extraPointsMissed: number;
  madeFieldGoalDistances: number[];
  missedFieldGoalDistances: number[];
}

export interface PlayerStatsImportSnapshot {
  seasonYear: number;
  nflTeams: NflTeam[];
  games: NflGame[];
  playerStats: PlayerGameStats[];
  sourceMappings: SourceMapping[];
}

export interface RelevantPlayer {
  id: CanonicalId;
  externalId: string;
}

export interface DatasetUnavailable {
  availability: "unavailable";
  reason: string;
}

export interface DatasetAvailable<T> {
  availability: "available";
  snapshot: T;
}

export type DatasetSourceResult<T> =
  | DatasetAvailable<T>
  | DatasetUnavailable;

export interface SeasonDatasetStatus {
  dataset: ImportDataset;
  status: ImportRunStatus | "not_imported";
  completedAt: IsoDateTime | null;
  message: string | null;
}

export interface MatchupRosterPlayer {
  playerId: CanonicalId;
  playerKind: PlayerKind;
  displayName: string;
  lineupSlot: LineupSlot;
  rosterOrder: number;
  actualFantasyPoints: number;
  projectedFantasyPoints: number | null;
}

export interface MatchupRosterTeam {
  franchiseId: CanonicalId;
  franchiseName: string | null;
  ownerName: string | null;
  matchupSide: "home" | "away";
  effectiveScore: number;
  rosterState: RosterSnapshotState;
  players: MatchupRosterPlayer[];
}

export interface MatchupRosterPeriod {
  scoringPeriod: number;
  teams: MatchupRosterTeam[];
}

export interface MatchupRosterDetail {
  matchupId: CanonicalId;
  seasonYear: number;
  matchupPeriod: number;
  phase: MatchupPhase;
  periods: MatchupRosterPeriod[];
}
