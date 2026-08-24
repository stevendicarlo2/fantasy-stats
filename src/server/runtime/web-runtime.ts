import "server-only";

import {
  createWebRuntime,
  type WebRuntime,
} from "./web-runtime-core";

const globalForWebRuntime = globalThis as typeof globalThis & {
  fantasyStatsWebRuntime?: Promise<WebRuntime>;
};

export function getWebRuntime() {
  globalForWebRuntime.fantasyStatsWebRuntime ??= createWebRuntime(process.env);
  return globalForWebRuntime.fantasyStatsWebRuntime;
}

export {
  createWebRuntime,
  WebStorageConfigurationError,
  type WebRuntime,
} from "./web-runtime-core";
