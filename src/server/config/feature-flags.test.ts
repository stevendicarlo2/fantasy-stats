import { describe, expect, it, vi } from "vitest";

import { parseFeatureFlags } from "./feature-flags";

describe("feature flags", () => {
  it("uses explicit registry defaults when configuration is absent", () => {
    expect(parseFeatureFlags({})).toEqual({
      isAutomaticDataSyncEnabled: false,
    });
  });

  it("applies configured boolean values", () => {
    expect(
      parseFeatureFlags({
        FANTASY_STATS_FEATURE_FLAGS: JSON.stringify({
          isAutomaticDataSyncEnabled: true,
        }),
      }),
    ).toEqual({
      isAutomaticDataSyncEnabled: true,
    });
  });

  it("warns and uses defaults for malformed JSON", () => {
    const warn = vi.fn();

    expect(
      parseFeatureFlags(
        { FANTASY_STATS_FEATURE_FLAGS: "not-json" },
        warn,
      ),
    ).toEqual({
      isAutomaticDataSyncEnabled: false,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid JSON"),
    );
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("not-json"),
    );
  });

  it("ignores unknown and non-boolean entries with warnings", () => {
    const warn = vi.fn();

    expect(
      parseFeatureFlags(
        {
          FANTASY_STATS_FEATURE_FLAGS: JSON.stringify({
            isAutomaticDataSyncEnabled: "yes",
            isUnknownEnabled: true,
          }),
        },
        warn,
      ),
    ).toEqual({
      isAutomaticDataSyncEnabled: false,
    });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Ignoring feature flag "isAutomaticDataSyncEnabled" because it is not boolean',
    );
    expect(warn).toHaveBeenCalledWith(
      'Ignoring unknown feature flag "isUnknownEnabled"',
    );
  });
});
