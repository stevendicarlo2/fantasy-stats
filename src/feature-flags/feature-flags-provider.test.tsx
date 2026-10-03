// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  FeatureFlagsProvider,
  useFeatureFlags,
} from "./feature-flags-provider";

function FlagConsumer() {
  const flags = useFeatureFlags();

  return (
    <p>
      {flags.isAutomaticDataSyncEnabled ? "enabled" : "disabled"}
    </p>
  );
}

describe("FeatureFlagsProvider", () => {
  it("exposes resolved flags to client components", () => {
    render(
      <FeatureFlagsProvider
        flags={{ isAutomaticDataSyncEnabled: true }}
      >
        <FlagConsumer />
      </FeatureFlagsProvider>,
    );

    expect(screen.getByText("enabled").textContent).toBe("enabled");
  });

  it("requires consumers to be inside the global provider", () => {
    expect(() => render(<FlagConsumer />)).toThrow(
      "useFeatureFlags must be used within FeatureFlagsProvider",
    );
  });
});
