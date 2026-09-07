import { SafeOperationalError } from "@/application/errors";

/**
 * ESPN's numeric `proTeamId` scheme is shared across its fantasy and public
 * NFL APIs and has remained stable across franchise relocations (the
 * relocated team keeps its historical ID). IDs 31 and 32 are unused by ESPN.
 */
const ESPN_PRO_TEAMS: Record<number, { abbreviation: string; displayName: string }> = {
  1: { abbreviation: "ATL", displayName: "Atlanta Falcons" },
  2: { abbreviation: "BUF", displayName: "Buffalo Bills" },
  3: { abbreviation: "CHI", displayName: "Chicago Bears" },
  4: { abbreviation: "CIN", displayName: "Cincinnati Bengals" },
  5: { abbreviation: "CLE", displayName: "Cleveland Browns" },
  6: { abbreviation: "DAL", displayName: "Dallas Cowboys" },
  7: { abbreviation: "DEN", displayName: "Denver Broncos" },
  8: { abbreviation: "DET", displayName: "Detroit Lions" },
  9: { abbreviation: "GB", displayName: "Green Bay Packers" },
  10: { abbreviation: "TEN", displayName: "Tennessee Titans" },
  11: { abbreviation: "IND", displayName: "Indianapolis Colts" },
  12: { abbreviation: "KC", displayName: "Kansas City Chiefs" },
  13: { abbreviation: "LV", displayName: "Las Vegas Raiders" },
  14: { abbreviation: "LAR", displayName: "Los Angeles Rams" },
  15: { abbreviation: "MIA", displayName: "Miami Dolphins" },
  16: { abbreviation: "MIN", displayName: "Minnesota Vikings" },
  17: { abbreviation: "NE", displayName: "New England Patriots" },
  18: { abbreviation: "NO", displayName: "New Orleans Saints" },
  19: { abbreviation: "NYG", displayName: "New York Giants" },
  20: { abbreviation: "NYJ", displayName: "New York Jets" },
  21: { abbreviation: "PHI", displayName: "Philadelphia Eagles" },
  22: { abbreviation: "ARI", displayName: "Arizona Cardinals" },
  23: { abbreviation: "PIT", displayName: "Pittsburgh Steelers" },
  24: { abbreviation: "LAC", displayName: "Los Angeles Chargers" },
  25: { abbreviation: "SF", displayName: "San Francisco 49ers" },
  26: { abbreviation: "SEA", displayName: "Seattle Seahawks" },
  27: { abbreviation: "TB", displayName: "Tampa Bay Buccaneers" },
  28: { abbreviation: "WSH", displayName: "Washington Commanders" },
  29: { abbreviation: "CAR", displayName: "Carolina Panthers" },
  30: { abbreviation: "JAX", displayName: "Jacksonville Jaguars" },
  33: { abbreviation: "BAL", displayName: "Baltimore Ravens" },
  34: { abbreviation: "HOU", displayName: "Houston Texans" },
};

export class EspnUnknownProTeamError extends SafeOperationalError {
  constructor(proTeamId: number) {
    super(`ESPN referenced an unrecognized NFL proTeamId ${proTeamId}`);
    this.name = "EspnUnknownProTeamError";
  }
}

export function resolveEspnProTeam(proTeamId: number) {
  const team = ESPN_PRO_TEAMS[proTeamId];

  if (!team) {
    throw new EspnUnknownProTeamError(proTeamId);
  }

  return team;
}
