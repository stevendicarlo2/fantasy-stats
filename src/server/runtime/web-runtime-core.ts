import { SafeOperationalError } from "@/application/errors";
import { ImportDashboardService } from "@/application/services/import-dashboard-service";
import { MatchupRosterService } from "@/application/services/matchup-roster-service";
import { MatchupAdjustmentService } from "@/application/services/matchup-adjustment-service";
import { DataSyncCoordinator } from "@/application/services/data-sync-coordinator";
import { SeasonDataImportService } from "@/application/services/season-data-import-service";
import { SeasonImportService } from "@/application/services/season-import-service";
import { SeasonStatsService } from "@/application/services/season-stats-service";
import { SeasonDataQueryService } from "@/application/services/season-data-query-service";
import { SupplementalImportService } from "@/application/services/supplemental-import-service";
import { SqlConsoleService } from "@/application/services/sql-console-service";
import { SqlQueryAssistantService } from "@/application/services/sql-query-assistant-service";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";
import { EspnNflSource } from "@/server/adapters/nfl/espn";
import { CopilotCliSqlQueryGenerator } from "@/server/adapters/sql/copilot-cli-sql-query-generator";
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
  seasonDataImportService: SeasonDataImportService;
  dashboardService: ImportDashboardService;
  seasonStatsService: SeasonStatsService;
  dataSyncCoordinator: DataSyncCoordinator;
  seasonDataQueryService: SeasonDataQueryService;
  matchupRosterService: MatchupRosterService;
  matchupAdjustmentService: MatchupAdjustmentService;
  sqlConsoleService: SqlConsoleService;
  sqlQueryAssistantService: SqlQueryAssistantService;
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
  const sqlConsoleService = new SqlConsoleService(storage.database);
  const importService = new SeasonImportService({
    database: storage.database,
    source,
  });
  const supplementalImportService = new SupplementalImportService({
    database: storage.database,
    rosterSource: source,
    transactionSource: source,
    nflSource: new EspnNflSource(),
  });
  const seasonDataImportService = new SeasonDataImportService(
    importService,
    supplementalImportService,
  );
  const dataSyncCoordinator = new DataSyncCoordinator({
    database: storage.database,
    importService: seasonDataImportService,
  });
  const seasonStatsService = new SeasonStatsService(storage.database);
  const matchupRosterService = new MatchupRosterService(storage.database);
  const matchupAdjustmentService = new MatchupAdjustmentService({
    database: storage.database,
  });

  return {
    storage,
    earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
    // NFL seasons start in September, so the current calendar year's season
    // is already importable well before the year ends.
    latestSeason: new Date().getFullYear(),
    importService,
    seasonDataImportService,
    dashboardService: new ImportDashboardService(storage.database),
    seasonStatsService,
    dataSyncCoordinator,
    seasonDataQueryService: new SeasonDataQueryService(
      dataSyncCoordinator,
      seasonStatsService,
      matchupRosterService,
      matchupAdjustmentService,
    ),
    matchupRosterService,
    matchupAdjustmentService,
    sqlConsoleService,
    sqlQueryAssistantService: new SqlQueryAssistantService(
      new CopilotCliSqlQueryGenerator(process.cwd()),
    ),
  };
}
