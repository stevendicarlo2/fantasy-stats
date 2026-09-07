import "server-only";

import {
  createWebRuntime,
  type WebRuntime,
} from "./web-runtime-core";

const globalForWebRuntime = globalThis as typeof globalThis & {
  fantasyStatsWebRuntimeCache?: {
    version: number;
    runtime: Promise<WebRuntime>;
  };
  fantasyStatsWebRuntime?: Promise<WebRuntime>;
};

const WEB_RUNTIME_CACHE_VERSION = 12;

export function getWebRuntime() {
  const cachedRuntime = globalForWebRuntime.fantasyStatsWebRuntimeCache;

  if (cachedRuntime?.version === WEB_RUNTIME_CACHE_VERSION) {
    return cachedRuntime.runtime;
  }

  const runtime = createWebRuntime(process.env);
  globalForWebRuntime.fantasyStatsWebRuntimeCache = {
    version: WEB_RUNTIME_CACHE_VERSION,
    runtime,
  };
  delete globalForWebRuntime.fantasyStatsWebRuntime;
  return runtime;
}

export {
  createWebRuntime,
  WebStorageConfigurationError,
  type WebRuntime,
} from "./web-runtime-core";
