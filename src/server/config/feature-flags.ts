import {
  defaultFeatureFlags,
  featureFlagRegistry,
  type FeatureFlagName,
  type FeatureFlags,
} from "@/feature-flags/definitions";

type EnvironmentValues = Readonly<Record<string, string | undefined>>;
type Warn = (message: string) => void;

const FEATURE_FLAGS_ENVIRONMENT_VARIABLE = "FANTASY_STATS_FEATURE_FLAGS";
let cachedProcessFlags:
  | {
      configured: string | undefined;
      flags: FeatureFlags;
    }
  | undefined;

function isFeatureFlagName(name: string): name is FeatureFlagName {
  return Object.hasOwn(featureFlagRegistry, name);
}

export function parseFeatureFlags(
  environment: EnvironmentValues,
  warn: Warn = console.warn,
): FeatureFlags {
  const configured = environment[FEATURE_FLAGS_ENVIRONMENT_VARIABLE]?.trim();
  const flags = { ...defaultFeatureFlags };

  if (!configured) {
    return flags;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    warn(
      `${FEATURE_FLAGS_ENVIRONMENT_VARIABLE} contains invalid JSON; using feature flag defaults`,
    );
    return flags;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    warn(
      `${FEATURE_FLAGS_ENVIRONMENT_VARIABLE} must contain a JSON object; using feature flag defaults`,
    );
    return flags;
  }

  for (const [name, value] of Object.entries(parsed)) {
    if (!isFeatureFlagName(name)) {
      warn(`Ignoring unknown feature flag "${name}"`);
      continue;
    }

    if (typeof value !== "boolean") {
      warn(`Ignoring feature flag "${name}" because it is not boolean`);
      continue;
    }

    flags[name] = value;
  }

  return flags;
}

export function getFeatureFlags(
  environment: EnvironmentValues = process.env,
): FeatureFlags {
  if (environment !== process.env) {
    return parseFeatureFlags(environment);
  }

  const configured = process.env[FEATURE_FLAGS_ENVIRONMENT_VARIABLE];
  const cached = cachedProcessFlags;
  if (cached && cached.configured === configured) {
    return cached.flags;
  }

  const flags = parseFeatureFlags(process.env);
  cachedProcessFlags = { configured, flags };
  return flags;
}
