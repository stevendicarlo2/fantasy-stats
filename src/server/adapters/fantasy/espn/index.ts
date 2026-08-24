import "server-only";

import { getEspnEnvironment } from "@/server/config/environment";

import { EspnFantasySource } from "./espn-source";

export function createEspnFantasySource() {
  const environment = getEspnEnvironment();

  return new EspnFantasySource({
    leagueId: environment.ESPN_LEAGUE_ID,
    earliestSeason: environment.ESPN_EARLIEST_SEASON,
    espnS2: environment.ESPN_S2,
    swid: environment.ESPN_SWID,
  });
}
