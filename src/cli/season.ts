import { loadEnvConfig } from "@next/env";

import { SeasonImportService } from "@/application/services/season-import-service";
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

      return {
        storageKind: storage.kind,
        persistent: storage.persistent,
        database,
        service: new SeasonImportService({ database, source }),
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
