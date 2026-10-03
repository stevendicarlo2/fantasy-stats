export const featureFlagRegistry = {
  isAutomaticDataSyncEnabled: {
    default: false,
    description:
      "Allows data-page requests to start automatic season synchronization.",
  },
} as const satisfies Record<
  `is${string}Enabled`,
  {
    default: boolean;
    description: string;
  }
>;

export type FeatureFlagName = keyof typeof featureFlagRegistry;
export type FeatureFlags = {
  [Name in FeatureFlagName]: boolean;
};

export const defaultFeatureFlags: FeatureFlags = Object.fromEntries(
  Object.entries(featureFlagRegistry).map(([name, definition]) => [
    name,
    definition.default,
  ]),
) as FeatureFlags;
