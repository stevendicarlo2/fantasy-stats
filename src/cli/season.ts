import { loadEnvConfig } from "@next/env";

import { SeasonImportService } from "@/application/services/season-import-service";
import { DataSyncCoordinator } from "@/application/services/data-sync-coordinator";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";
import {
  parseDatabaseEnvironment,
  parseEspnEnvironment,
} from "@/server/config/environment-schema";
import {
  createSelectedStorage,
  type StorageSelection,
} from "@/server/storage/storage-provider";

import {
  resolveSeasonArguments,
  runSeasonCli,
} from "./season-command";

loadEnvConfig(process.cwd());

async function main() {
  const exitCode = await runSeasonCli(
    resolveSeasonArguments(
      process.argv.slice(2),
      {
        year: process.env.npm_config_year,
        storage:
          process.env.npm_config_storage ??
          process.env.FANTASY_STATS_STORAGE,
        databaseFile:
          process.env.npm_config_database_file ??
          process.env.FANTASY_STATS_LOCAL_DATABASE_FILE,
      },
    ),
    async (command) => {
      const espnEnvironment = parseEspnEnvironment(process.env);
      let selection: StorageSelection;

      if (command.storage === "dummy") {
        selection = { kind: "dummy" };
      } else if (command.storage === "local") {
        selection = {
          kind: "local",
          databaseFile: command.databaseFile!,
        };
      } else {
        selection = {
          kind: "turso",
          environment: parseDatabaseEnvironment(process.env),
        };
      }

      const storage = await createSelectedStorage(selection);
      const database = storage.database;
      const source = new EspnFantasySource({
        leagueId: espnEnvironment.ESPN_LEAGUE_ID,
        earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
        espnS2: espnEnvironment.ESPN_S2,
        swid: espnEnvironment.ESPN_SWID,
      });
      const importService = new SeasonImportService({ database, source });
      const coordinator = new DataSyncCoordinator({
        database,
        importService: {
          providerForDataset() {
            return importService.provider;
          },
          prepareDataset(year, dataset, operation) {
            if (dataset !== "core") {
              throw new Error("The season CLI only supports core data");
            }
            return importService.prepareOperation(operation, year);
          },
          executeStartedRun(run) {
            return importService.executeStartedRun(run);
          },
        },
      });

      return {
        storageKind: storage.kind,
        persistent: storage.persistent,
        database,
        service: {
          importSeason(year: number) {
            return coordinator.runDatasetAndWait({
              year,
              dataset: "core",
              operation: "import",
              trigger: "cli",
            });
          },
          refreshSeason(year: number) {
            return coordinator.runDatasetAndWait({
              year,
              dataset: "core",
              operation: "refresh",
              trigger: "cli",
            });
          },
        },
        close() {
          storage.close();
        },
      };
    },
    {
      stdout(message) {
        console.log(message);
      },
      stderr(message) {
        console.error(message);
      },
    },
  );

  process.exitCode = exitCode;
}

void main();
