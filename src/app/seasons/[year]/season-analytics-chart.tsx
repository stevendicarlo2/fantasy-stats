"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AnalyticsChartPoint,
  AnalyticsChartSeries,
  AnalyticsFranchise,
} from "@/application/analytics/season-analytics";

import { presentChartSeries } from "./season-analytics-presentation";

interface SeasonAnalyticsChartProps {
  points: AnalyticsChartPoint[];
  series: AnalyticsChartSeries[];
  franchises: AnalyticsFranchise[];
}

export function SeasonAnalyticsChart({
  points,
  series,
  franchises,
}: SeasonAnalyticsChartProps) {
  const presentedSeries = useMemo(
    () =>
      series.map((item) => presentChartSeries(item, franchises)),
    [franchises, series],
  );
  const hasPointMetrics = presentedSeries.some(
    (item) => item.metric !== "score",
  );
  const hasScoreMetric = presentedSeries.some(
    (item) => item.metric === "score",
  );

  return (
    <article className="panel analytics-chart-panel">
      <div className="analytics-subheading">
        <div>
          <p className="panel-kicker">Weekly trends</p>
          <h2>Scores over time</h2>
        </div>
        <span>{presentedSeries.length} visible series</span>
      </div>
      {presentedSeries.length === 0 ? (
        <p>Select at least one person to display the chart.</p>
      ) : (
        <div className="chart-container">
          <div className="chart-legend" aria-label="Chart series">
            {presentedSeries.map((item) => (
              <div className="chart-legend-item" key={item.key}>
                <span
                  className={`chart-line-sample ${item.metric}`}
                  style={{
                    color: item.color,
                    opacity: item.opacity,
                  }}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={430}>
            <LineChart
              data={points}
              margin={{ top: 12, right: 24, bottom: 12, left: 8 }}
            >
              <CartesianGrid stroke="#203e32" strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                stroke="#91a99e"
                tickFormatter={(week) => `W${week}`}
              />
              {hasPointMetrics ? (
                <YAxis
                  yAxisId="points"
                  stroke="#91a99e"
                  label={{
                    value: "NP / ANP",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#91a99e",
                  }}
                />
              ) : null}
              {hasScoreMetric ? (
                <YAxis
                  yAxisId="score"
                  orientation="right"
                  stroke="#91a99e"
                  label={{
                    value: "Score",
                    angle: 90,
                    position: "insideRight",
                    fill: "#91a99e",
                  }}
                />
              ) : null}
              <Tooltip
                contentStyle={{
                  background: "#0b2118",
                  border: "1px solid #426657",
                  borderRadius: "0.75rem",
                }}
                labelFormatter={(week) => `Week ${week}`}
                itemSorter={(item) => {
                  const value = Number(item.value);

                  return Number.isFinite(value) ? -value : 0;
                }}
              />
              {presentedSeries.map((item) => (
                <Line
                  type="linear"
                  dataKey={item.key}
                  name={item.label}
                  yAxisId={
                    item.metric === "score" ? "score" : "points"
                  }
                  stroke={item.color}
                  strokeWidth={3}
                  strokeOpacity={item.opacity}
                  strokeDasharray={item.dash}
                  dot={{
                    r: 2.5,
                    fill: item.color,
                    fillOpacity: item.opacity,
                    strokeOpacity: item.opacity,
                  }}
                  activeDot={{
                    r: 5,
                    fillOpacity: item.opacity,
                    strokeOpacity: item.opacity,
                  }}
                  connectNulls={false}
                  isAnimationActive={false}
                  key={item.key}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}
