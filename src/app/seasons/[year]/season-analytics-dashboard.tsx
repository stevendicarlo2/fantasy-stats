"use client";

import { useMemo, useState } from "react";

import {
  buildAnalyticsChart,
  createDefaultAnalyticsFilters,
  listAnalyticsFranchises,
  summarizeAnalytics,
  type AnalyticsFilters,
} from "@/application/analytics/season-analytics";
import type { SeasonAnalyticsRecord } from "@/application/services/season-stats-service";

import { SeasonAnalyticsChart } from "./season-analytics-chart";
import { SeasonAnalyticsFilters } from "./season-analytics-filters";
import {
  SeasonAnalyticsTable,
  type AnalyticsTableMode,
} from "./season-analytics-table";

interface SeasonAnalyticsDashboardProps {
  records: SeasonAnalyticsRecord[];
  playoffTeamCount: number | null;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
}

export function SeasonAnalyticsDashboard({
  records,
  playoffTeamCount,
  regularSeasonStartWeek,
  regularSeasonEndWeek,
}: SeasonAnalyticsDashboardProps) {
  const defaultFilters = useMemo(
    () =>
      createDefaultAnalyticsFilters(
        records,
        regularSeasonStartWeek,
        regularSeasonEndWeek,
      ),
    [records, regularSeasonEndWeek, regularSeasonStartWeek],
  );
  const [filters, setFilters] =
    useState<AnalyticsFilters>(defaultFilters);
  const [tableMode, setTableMode] =
    useState<AnalyticsTableMode>("default");
  const franchises = useMemo(
    () => listAnalyticsFranchises(records),
    [records],
  );
  const allFranchiseIds = useMemo(
    () => franchises.map((franchise) => franchise.id),
    [franchises],
  );
  const defaultTableFilters = useMemo<AnalyticsFilters>(
    () => ({
      ...defaultFilters,
      metrics: ["np", "anp"],
      perspectives: ["team"],
      tableMetric: "anp",
      tablePerspective: "team",
    }),
    [defaultFilters],
  );
  const tableFilters =
    tableMode === "default" ? defaultTableFilters : filters;
  const tableRows = useMemo(
    () => summarizeAnalytics(records, tableFilters),
    [records, tableFilters],
  );
  const heatRows = useMemo(
    () =>
      summarizeAnalytics(records, {
        ...tableFilters,
        selectedFranchiseIds: allFranchiseIds,
      }),
    [allFranchiseIds, records, tableFilters],
  );
  const chart = useMemo(
    () => buildAnalyticsChart(records, filters),
    [filters, records],
  );

  return (
    <section className="analytics-section">
      <div className="analytics-heading">
        <div>
          <p className="panel-kicker">Season analytics</p>
          <h2>Adjusted NASCAR standings</h2>
        </div>
      </div>

      <SeasonAnalyticsTable
        mode={tableMode}
        onModeChange={setTableMode}
        filters={tableFilters}
        rows={tableRows}
        heatRows={heatRows}
        records={records}
        playoffTeamCount={playoffTeamCount}
      />

      <SeasonAnalyticsFilters
        filters={filters}
        franchises={franchises}
        tableUsesFilters={tableMode === "filtered"}
        regularSeasonStartWeek={regularSeasonStartWeek}
        regularSeasonEndWeek={regularSeasonEndWeek}
        defaultFilters={defaultFilters}
        setFilters={setFilters}
      />

      <SeasonAnalyticsChart
        points={chart.points}
        series={chart.series}
        franchises={franchises}
      />
    </section>
  );
}
