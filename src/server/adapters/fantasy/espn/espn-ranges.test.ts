import { describe, expect, it } from "vitest";

import { buildObservationRanges } from "./espn-ranges";

describe("buildObservationRanges", () => {
  it("merges consecutive scoring periods with the same value into one range", () => {
    const ranges = buildObservationRanges([
      { scoringPeriod: 1, value: "team-a" },
      { scoringPeriod: 2, value: "team-a" },
      { scoringPeriod: 3, value: "team-a" },
    ]);

    expect(ranges).toEqual([
      { value: "team-a", startScoringPeriod: 1, endScoringPeriod: 3 },
    ]);
  });

  it("splits a new range when the observed value changes", () => {
    const ranges = buildObservationRanges([
      { scoringPeriod: 1, value: "team-a" },
      { scoringPeriod: 2, value: "team-a" },
      { scoringPeriod: 3, value: "team-b" },
    ]);

    expect(ranges).toEqual([
      { value: "team-a", startScoringPeriod: 1, endScoringPeriod: 2 },
      { value: "team-b", startScoringPeriod: 3, endScoringPeriod: 3 },
    ]);
  });

  it("splits a new range across an observation gap even when the value repeats", () => {
    const ranges = buildObservationRanges([
      { scoringPeriod: 1, value: "team-a" },
      { scoringPeriod: 3, value: "team-a" },
    ]);

    expect(ranges).toEqual([
      { value: "team-a", startScoringPeriod: 1, endScoringPeriod: 1 },
      { value: "team-a", startScoringPeriod: 3, endScoringPeriod: 3 },
    ]);
  });

  it("sorts unordered observations before building ranges", () => {
    const ranges = buildObservationRanges([
      { scoringPeriod: 2, value: "QB" },
      { scoringPeriod: 1, value: "QB" },
    ]);

    expect(ranges).toEqual([
      { value: "QB", startScoringPeriod: 1, endScoringPeriod: 2 },
    ]);
  });

  it("returns an empty array for no observations", () => {
    expect(buildObservationRanges([])).toEqual([]);
  });
});
