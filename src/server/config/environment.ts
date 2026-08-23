import "server-only";

import {
  parseDatabaseEnvironment,
  parseEspnEnvironment,
} from "./environment-schema";

export function getDatabaseEnvironment() {
  return parseDatabaseEnvironment(process.env);
}

export function getEspnEnvironment() {
  return parseEspnEnvironment(process.env);
}
