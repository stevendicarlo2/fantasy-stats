import { loadEnvConfig } from "@next/env";

import { SeasonImportService } from "@/application/services/season-import-service";
import { createLibSqlDatabaseProvider } from "@/server/adapters/database/libsql/libsql-database-provider";
import { EspnFantasySource } from "@/server/adapters/fantasy/espn/espn-source";
import {
  parseDatabaseEnvironment,
  parseEspnEnvironment,
} from "@/server/config/environment-schema";

import {
  resolveSeasonArguments,
  runSeasonCli,
} from "./season-command";

loadEnvConfig(process.cwd());

async function main() {
  const exitCode = await runSeasonCli(
    resolveSeasonArguments(
      process.argv.slice(2),
      process.env.npm_config_year,
    ),
    () => {
      const databaseEnvironment = parseDatabaseEnvironment(process.env);
      const espnEnvironment = parseEspnEnvironment(process.env);
      const database = createLibSqlDatabaseProvider({
        url: databaseEnvironment.TURSO_DATABASE_URL,
        authToken: databaseEnvironment.TURSO_AUTH_TOKEN,
      });
      const source = new EspnFantasySource({
        leagueId: espnEnvironment.ESPN_LEAGUE_ID,
        earliestSeason: espnEnvironment.ESPN_EARLIEST_SEASON,
        espnS2: espnEnvironment.ESPN_S2,
        swid: espnEnvironment.ESPN_SWID,
      });

      return {
        database,
        service: new SeasonImportService({ database, source }),
        close() {
          database.close();
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
