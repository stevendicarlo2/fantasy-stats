import { describe, expect, it } from "vitest";

import {
  analyticsHeatColor,
  buildAnalyticsChart,
  createDefaultAnalyticsFilters,
  filterAnalyticsRecords,
  sortAnalyticsSummary,
  summarizeAnalytics,
} from "./season-analytics";
import type { SeasonAnalyticsRecord } from "@/application/services/season-stats-service";

const records: SeasonAnalyticsRecord[] = [
  {
    franchiseId: "a",
    displayName: "Alpha",
    teamName: "Alpha Team",
    opponentFranchiseId: "b",
    opponentDisplayName: "Beta",
    opponentTeamName: "Beta Team",
    week: 1,
    team: { score: 100, np: 2, anp: 4 },
    opponent: { score: 90, np: 1, anp: 1 },
  },
  {
    franchiseId: "b",
    displayName: "Beta",
    teamName: "Beta Team",
    opponentFranchiseId: "a",
    opponentDisplayName: "Alpha",
    opponentTeamName: "Alpha Team",
    week: 1,
    team: { score: 90, np: 1, anp: 1 },
    opponent: { score: 100, np: 2, anp: 4 },
  },
  {
    franchiseId: "a",
    displayName: "Alpha",
    teamName: "Alpha Team",
    opponentFranchiseId: "b",
    opponentDisplayName: "Beta",
    opponentTeamName: "Beta Team",
    week: 2,
    team: { score: 80, np: 1, anp: 1 },
    opponent: { score: 110, np: 2, anp: 4 },
  },
  {
    franchiseId: "b",
    displayName: "Beta",
    teamName: "Beta Team",
    opponentFranchiseId: "a",
    opponentDisplayName: "Alpha",
    opponentTeamName: "Alpha Team",
    week: 2,
    team: { score: 110, np: 2, anp: 4 },
    opponent: { score: 80, np: 1, anp: 1 },
  },
];

describe("season analytics model", () => {
  it("defaults to every franchise, every week, ANP, and team perspective", () => {
    expect(createDefaultAnalyticsFilters(records, 1, 2)).toEqual({
      selectedFranchiseIds: ["a", "b"],
      startWeek: 1,
      endWeek: 2,
      metrics: ["anp"],
      perspectives: ["team"],
      tableMetric: "anp",
      tablePerspective: "team",
    });
  });

  it("filters by franchise and inclusive week range", () => {
    expect(
      filterAnalyticsRecords(records, {
        selectedFranchiseIds: ["a"],
        startWeek: 2,
        endWeek: 2,
        metrics: ["anp"],
        perspectives: ["team"],
        tableMetric: "anp",
        tablePerspective: "team",
      }),
    ).toEqual([records[2]]);
  });

  it("aggregates and ranks the selected range and perspective", () => {
    const summary = summarizeAnalytics(records, {
      selectedFranchiseIds: ["a", "b"],
      startWeek: 1,
      endWeek: 2,
      metrics: ["anp"],
      perspectives: ["team"],
      tableMetric: "anp",
      tablePerspective: "team",
    });

    expect(summary).toEqual([
      expect.objectContaining({
        displayName: "Alpha",
        rank: 1,
        totals: {
          team: { score: 180, np: 3, anp: 5 },
          opponent: { score: 200, np: 3, anp: 5 },
        },
      }),
      expect.objectContaining({
        displayName: "Beta",
        rank: 1,
      }),
    ]);
  });

  it("ranks by opponent values in opponent-only mode", () => {
    const summary = summarizeAnalytics(records, {
      selectedFranchiseIds: ["a", "b"],
      startWeek: 1,
      endWeek: 1,
      metrics: ["anp", "score"],
      perspectives: ["team", "opponent"],
      tableMetric: "score",
      tablePerspective: "opponent",
    });

    expect(summary.map((row) => row.displayName)).toEqual([
      "Beta",
      "Alpha",
    ]);
  });

  it("builds team and opponent chart series for selected metrics", () => {
    const chart = buildAnalyticsChart(records, {
      selectedFranchiseIds: ["a"],
      startWeek: 1,
      endWeek: 2,
      metrics: ["anp", "score"],
      perspectives: ["team", "opponent"],
      tableMetric: "anp",
      tablePerspective: "team",
    });

    expect(chart.series).toHaveLength(4);
    expect(chart.points).toEqual([
      expect.objectContaining({ week: 1 }),
      expect.objectContaining({ week: 2 }),
    ]);
    expect(
      chart.series.map((series) => series.label),
    ).toEqual([
      "Alpha · ANP · Team",
      "Alpha · ANP · Opponent",
      "Alpha · Score · Team",
      "Alpha · Score · Opponent",
    ]);
    expect(new Set(chart.series.map((series) => series.color)).size).toBe(
      1,
    );
    expect(chart.series.map((series) => series.dash)).toEqual([
      "10 6",
      "10 6",
      "2 5",
      "2 5",
    ]);
    expect(chart.series.map((series) => series.opacity)).toEqual([
      1,
      0.42,
      1,
      0.42,
    ]);
  });

  it("sorts totals and weekly values without changing standings ranks", () => {
    const summary = summarizeAnalytics(records, {
      selectedFranchiseIds: ["a", "b"],
      startWeek: 1,
      endWeek: 2,
      metrics: ["anp"],
      perspectives: ["team"],
      tableMetric: "anp",
      tablePerspective: "team",
    });

    expect(
      sortAnalyticsSummary(
        summary,
        "total:team:score",
        "desc",
        "anp",
        "team",
      ).map((row) => row.displayName),
    ).toEqual(["Beta", "Alpha"]);
    expect(
      sortAnalyticsSummary(
        summary,
        "week:1",
        "asc",
        "anp",
        "team",
      ).map((row) => row.displayName),
    ).toEqual(["Beta", "Alpha"]);
    expect(summary.map((row) => row.rank)).toEqual([1, 1]);
  });

  it("uses a strong red-to-blue heat scale", () => {
    const values = [0, 5, 10];

    expect(analyticsHeatColor(0, values)).toBe("rgb(218 80 84)");
    expect(analyticsHeatColor(5, values)).toBe("rgb(72 67 67)");
    expect(analyticsHeatColor(10, values)).toBe(
      "rgb(70 108 218)",
    );
  });
});
