import { SafeOperationalError } from "@/application/errors";
import { ImportDashboardService } from "@/application/services/import-dashboard-service";
import { MatchupAdjustmentService } from "@/application/services/matchup-adjustment-service";
import { SeasonImportService } from "@/application/services/season-import-service";
import { SeasonStatsService } from "@/application/services/season-stats-service";
import { SqlConsoleService } from "@/application/services/sql-console-service";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";
import {
  parseDatabaseEnvironment,
  parseEspnEnvironment,
} from "@/server/config/environment-schema";
import {
  createSelectedStorage,
  type SelectedStorage,
  type StorageSelection,
} from "@/server/storage/storage-provider";

type EnvironmentValues = Readonly<Record<string, string | undefined>>;

export interface WebRuntime {
  storage: SelectedStorage;
  earliestSeason: number;
  latestSeason: number;
  importService: SeasonImportService;
  dashboardService: ImportDashboardService;
  seasonStatsService: SeasonStatsService;
  matchupAdjustmentService: MatchupAdjustmentService;
  sqlConsoleService: SqlConsoleService;
}

export class WebStorageConfigurationError extends SafeOperationalError {
  constructor(message: string) {
    super(message);
    this.name = "WebStorageConfigurationError";
  }
}

function getStorageSelection(
  environment: EnvironmentValues,
): StorageSelection {
  const storage = environment.FANTASY_STATS_STORAGE ?? "local";

  if (storage === "dummy") {
    throw new WebStorageConfigurationError(
      "The web application requires persistent storage. Set FANTASY_STATS_STORAGE to local or turso.",
    );
  }

  if (storage === "local") {
    return {
      kind: "local",
      databaseFile:
        environment.FANTASY_STATS_LOCAL_DATABASE_FILE ??
        ".data/fantasy-stats.db",
    };
  }

  if (storage === "turso") {
    return {
      kind: "turso",
      environment: parseDatabaseEnvironment(environment),
    };
  }

  throw new WebStorageConfigurationError(
    "FANTASY_STATS_STORAGE must be dummy, local, or turso",
  );
}

export async function createWebRuntime(
  environment: EnvironmentValues,
): Promise<WebRuntime> {
  const espnEnvironment = parseEspnEnvironment(environment);
  const storage = await createSelectedStorage(
    getStorageSelection(environment),
  );

  try {
    await storage.database.runMigrations();
  } catch (error) {
    storage.close();
    throw error;
  }

  const source = new EspnFantasySource({
    leagueId: espnEnvironment.ESPN_LEAGUE_ID,
    earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
    espnS2: espnEnvironment.ESPN_S2,
    swid: espnEnvironment.ESPN_SWID,
  });

  return {
    storage,
    earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
    latestSeason: new Date().getFullYear() - 1,
    importService: new SeasonImportService({
      database: storage.database,
      source,
    }),
    dashboardService: new ImportDashboardService(storage.database),
    seasonStatsService: new SeasonStatsService(storage.database),
    matchupAdjustmentService: new MatchupAdjustmentService({
      database: storage.database,
    }),
    sqlConsoleService: new SqlConsoleService(storage.database),
  };
}
