import type {
  AnalyticsChartSeries,
  AnalyticsFranchise,
  AnalyticsMetric,
  AnalyticsPerspective,
  AnalyticsValueRange,
} from "@/application/analytics/season-analytics";

export const analyticsMetricLabels: Record<AnalyticsMetric, string> = {
  np: "NP",
  anp: "ANP",
  score: "Score",
};

export const perspectiveLabels: Record<AnalyticsPerspective, string> = {
  team: "Team",
  opponent: "Opponent",
};

export function formatAnalyticsValue(
  metric: AnalyticsMetric,
  value: number,
) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: metric === "score" ? 2 : 1,
    useGrouping: false,
  });
}

export function analyticsHeatColor(
  value: number,
  range: AnalyticsValueRange | null,
) {
  if (!range) {
    return "transparent";
  }

  if (range.minimum === range.maximum) {
    return "rgb(255 255 255)";
  }

  const position =
    (value - range.minimum) / (range.maximum - range.minimum);
  const low = [241, 131, 123];
  const middle = [255, 255, 255];
  const high = [109, 148, 254];
  const start = position < 0.5 ? low : middle;
  const end = position < 0.5 ? middle : high;
  const segmentPosition =
    position < 0.5 ? position * 2 : (position - 0.5) * 2;
  const color = start.map((channel, index) =>
    Math.round(
      channel + (end[index] - channel) * segmentPosition,
    ),
  );

  return `rgb(${color.join(" ")})`;
}

function franchiseColor(index: number) {
  const hue = (index * 137.508) % 360;
  const saturation = 68 + (index % 3) * 7;
  const lightness = 57 + (index % 2) * 10;

  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

function lineDash(metric: AnalyticsMetric) {
  if (metric === "anp") {
    return "10 6";
  }

  return metric === "score" ? "2 5" : undefined;
}

export function presentChartSeries(
  series: AnalyticsChartSeries,
  franchises: AnalyticsFranchise[],
) {
  const franchiseIndex = franchises.findIndex(
    (franchise) => franchise.id === series.franchiseId,
  );

  return {
    ...series,
    label: `${series.displayName} · ${
      analyticsMetricLabels[series.metric]
    } · ${perspectiveLabels[series.perspective]}`,
    color: franchiseColor(franchiseIndex),
    dash: lineDash(series.metric),
    opacity: series.perspective === "team" ? 1 : 0.42,
  };
}
