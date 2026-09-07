import { SafeOperationalError } from "@/application/errors";
import { ImportDashboardService } from "@/application/services/import-dashboard-service";
import { MatchupRosterService } from "@/application/services/matchup-roster-service";
import { MatchupAdjustmentService } from "@/application/services/matchup-adjustment-service";
import { SeasonDataImportService } from "@/application/services/season-data-import-service";
import { SeasonImportService } from "@/application/services/season-import-service";
import { SeasonStatsService } from "@/application/services/season-stats-service";
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

  return {
    storage,
    earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
    latestSeason: new Date().getFullYear() - 1,
    importService,
    seasonDataImportService: new SeasonDataImportService(
      importService,
      supplementalImportService,
    ),
    dashboardService: new ImportDashboardService(storage.database),
    seasonStatsService: new SeasonStatsService(storage.database),
    matchupRosterService: new MatchupRosterService(storage.database),
    matchupAdjustmentService: new MatchupAdjustmentService({
      database: storage.database,
    }),
    sqlConsoleService,
    sqlQueryAssistantService: new SqlQueryAssistantService(
      new CopilotCliSqlQueryGenerator(process.cwd()),
    ),
  };
}
