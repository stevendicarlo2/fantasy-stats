import type { CanonicalId } from "@/domain/types";

import type {
  DataSyncCoordinator,
  DataSyncViewState,
} from "./data-sync-coordinator";
import type { MatchupAdjustmentService } from "./matchup-adjustment-service";
import type { MatchupRosterService } from "./matchup-roster-service";
import type { SeasonStatsService } from "./season-stats-service";

export interface SyncAwareResult<T> {
  data: T;
  sync: DataSyncViewState;
}

export class SeasonDataQueryService {
  constructor(
    private readonly sync: DataSyncCoordinator,
    private readonly seasonStats: SeasonStatsService,
    private readonly matchupRosters: MatchupRosterService,
    private readonly adjustments: MatchupAdjustmentService,
  ) {}

  async getSeasonPage(seasonYear: number) {
    const [stats, availableYears] = await Promise.all([
      this.seasonStats.getSeasonStats(seasonYear),
      this.seasonStats.getAvailableSeasonYears(),
    ]);
    const sync = stats
      ? await this.sync.observeView(seasonYear, "season")
      : noSyncState();

    return {
      data: { stats, availableYears },
      sync,
    } satisfies SyncAwareResult<{
      stats: Awaited<ReturnType<SeasonStatsService["getSeasonStats"]>>;
      availableYears: number[];
    }>;
  }

  async getMatchupPage(
    seasonYear: number,
    matchupId: CanonicalId,
  ) {
    const matchup = await this.matchupRosters.getMatchupRoster(
      seasonYear,
      matchupId,
    );
    const sync = matchup
      ? await this.sync.observeView(seasonYear, "matchup")
      : noSyncState();

    return { data: matchup, sync };
  }

  async getAdjustmentPage(seasonYear: number) {
    const [stats, adjustments, availableYears] = await Promise.all([
      this.seasonStats.getSeasonStats(seasonYear),
      this.adjustments.listSeasonAdjustments(seasonYear),
      this.seasonStats.getAvailableSeasonYears(),
    ]);
    const sync =
      stats && adjustments
        ? await this.sync.observeView(seasonYear, "adjustments")
        : noSyncState();

    return {
      data: { stats, adjustments, availableYears },
      sync,
    };
  }
}

function noSyncState(): DataSyncViewState {
  return {
    isSyncing: false,
    revision: "",
    pollAfterMs: null,
  };
}
