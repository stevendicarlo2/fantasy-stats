import { describe, expect, it } from "vitest";

import {
  analyticsHeatColor,
  presentChartSeries,
} from "./season-analytics-presentation";

describe("season analytics presentation", () => {
  it("formats heat ranges as presentation colors", () => {
    const range = { minimum: 0, maximum: 10 };

    expect(analyticsHeatColor(0, range)).toBe("rgb(218 80 84)");
    expect(analyticsHeatColor(5, range)).toBe("rgb(72 67 67)");
    expect(analyticsHeatColor(10, range)).toBe("rgb(70 108 218)");
  });

  it("assigns owner colors, metric patterns, and opponent opacity", () => {
    const franchises = [
      { id: "a", displayName: "Alpha", teamName: "Alpha Team" },
    ];
    const presented = presentChartSeries(
      {
        key: "a__anp__opponent",
        franchiseId: "a",
        displayName: "Alpha",
        metric: "anp",
        perspective: "opponent",
      },
      franchises,
    );

    expect(presented).toMatchObject({
      label: "Alpha · ANP · Opponent",
      dash: "10 6",
      opacity: 0.42,
    });
  });
});
