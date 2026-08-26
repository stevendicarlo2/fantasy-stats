"use client";

import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  findAnalyticsValueRange,
  sortAnalyticsSummary,
  type AnalyticsFilters,
  type AnalyticsMetric,
  type AnalyticsPerspective,
  type AnalyticsSortDirection,
  type AnalyticsSortKey,
  type AnalyticsSummaryRow,
} from "@/application/analytics/season-analytics";
import type { SeasonAnalyticsRecord } from "@/application/services/season-stats-service";

import {
  analyticsHeatColor,
  analyticsMetricLabels,
  formatAnalyticsValue,
} from "./season-analytics-presentation";

export type AnalyticsTableMode = "default" | "filtered";

interface SeasonAnalyticsTableProps {
  mode: AnalyticsTableMode;
  onModeChange: (mode: AnalyticsTableMode) => void;
  filters: AnalyticsFilters;
  rows: AnalyticsSummaryRow[];
  heatRows: AnalyticsSummaryRow[];
  records: SeasonAnalyticsRecord[];
  playoffTeamCount: number;
}

export function SeasonAnalyticsTable({
  mode,
  onModeChange,
  filters,
  rows,
  heatRows,
  records,
  playoffTeamCount,
}: SeasonAnalyticsTableProps) {
  const [sort, setSort] = useState<{
    key: AnalyticsSortKey;
    direction: AnalyticsSortDirection;
  }>({ key: "rank", direction: "asc" });
  const tableRef = useRef<HTMLTableElement>(null);
  const weeks = useMemo(
    () =>
      Array.from(
        { length: filters.endWeek - filters.startWeek + 1 },
        (_, index) => filters.startWeek + index,
      ),
    [filters.endWeek, filters.startWeek],
  );
  const totalColumns = useMemo(
    () =>
      filters.perspectives.flatMap((perspective) =>
        filters.metrics.map((metric) => ({
          key: `total:${perspective}:${metric}` as const,
          metric,
          perspective,
        })),
      ),
    [filters.metrics, filters.perspectives],
  );
  const visibleSortKeys = new Set<AnalyticsSortKey>([
    "rank",
    "person",
    "team",
    ...totalColumns.map((column) => column.key),
    ...weeks.map((week) => `week:${week}` as const),
  ]);
  const effectiveSort = visibleSortKeys.has(sort.key)
    ? sort
    : { key: "rank" as const, direction: "asc" as const };
  const sortedRows = useMemo(
    () =>
      sortAnalyticsSummary(
        rows,
        effectiveSort.key,
        effectiveSort.direction,
        filters.tableMetric,
        filters.tablePerspective,
      ),
    [
      effectiveSort.direction,
      effectiveSort.key,
      filters.tableMetric,
      filters.tablePerspective,
      rows,
    ],
  );
  const totalRanges = useMemo(
    () =>
      new Map(
        totalColumns.map(({ key, metric, perspective }) => [
          key,
          findAnalyticsValueRange(
            heatRows.map((row) => row.totals[perspective][metric]),
          ),
        ]),
      ),
    [heatRows, totalColumns],
  );
  const weeklyRanges = useMemo(
    () =>
      new Map(
        weeks.map((week) => [
          week,
          findAnalyticsValueRange(
            records
              .filter((record) => record.week === week)
              .map(
                (record) =>
                  record[filters.tablePerspective][filters.tableMetric],
              ),
          ),
        ]),
      ),
    [
      filters.tableMetric,
      filters.tablePerspective,
      records,
      weeks,
    ],
  );
  const tableStyle = {
    "--person-column-width": "96px",
    "--team-column-width": "192px",
  } as CSSProperties;

  useLayoutEffect(() => {
    const table = tableRef.current;
    const context = document.createElement("canvas").getContext("2d");

    if (!table || !context) {
      return;
    }

    context.font = getComputedStyle(table).font;
    const measure = (values: string[]) =>
      Math.ceil(
        Math.max(...values.map((value) => context.measureText(value).width)) +
          14,
      );
    table.style.setProperty(
      "--person-column-width",
      `${measure(["Person", ...rows.map((row) => row.displayName)])}px`,
    );
    table.style.setProperty(
      "--team-column-width",
      `${measure(["Team", ...rows.map((row) => row.teamName)])}px`,
    );
  }, [rows]);

  function toggleSort(key: AnalyticsSortKey) {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction:
            current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction:
          key === "rank" || key === "person" || key === "team"
            ? "asc"
            : "desc",
      };
    });
  }

  function sortLabel(key: AnalyticsSortKey, label: string) {
    const active = effectiveSort.key === key;

    return (
      <button
        className="sort-button"
        type="button"
        aria-label={`Sort by ${label}`}
        onClick={() => toggleSort(key)}
      >
        {label}
        <span aria-hidden="true">
          {active
            ? effectiveSort.direction === "asc"
              ? "▲"
              : "▼"
            : ""}
        </span>
      </button>
    );
  }

  const showPlayoffCutoff =
    mode === "default" &&
    ((effectiveSort.key === "rank" &&
      effectiveSort.direction === "asc") ||
      (effectiveSort.key === "total:team:anp" &&
        effectiveSort.direction === "desc"));

  return (
    <article className="panel analytics-table-panel">
      <div className="analytics-subheading">
        <div>
          <p className="panel-kicker">
            {mode === "default"
              ? "Default standings"
              : "Filtered standings"}
          </p>
          <h2>
            Weeks {filters.startWeek}-{filters.endWeek}
          </h2>
        </div>
        <div className="segmented-control table-mode-toggle">
          <button
            className={mode === "default" ? "selected" : ""}
            type="button"
            aria-pressed={mode === "default"}
            onClick={() => onModeChange("default")}
          >
            Default standings
          </button>
          <button
            className={mode === "filtered" ? "selected" : ""}
            type="button"
            aria-pressed={mode === "filtered"}
            onClick={() => onModeChange("filtered")}
          >
            Use filtered values
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p>Select at least one person to display standings.</p>
      ) : (
        <div className="table-wrap analytics-table-wrap">
          <table
            className="analytics-table"
            style={tableStyle}
            ref={tableRef}
          >
            <colgroup>
              <col className="analytics-person-column" />
              <col className="analytics-team-column" />
              {totalColumns.map((column) => (
                <col
                  className="analytics-total-column"
                  key={column.key}
                />
              ))}
              {weeks.map((week) => (
                <col
                  className="analytics-week-column"
                  key={week}
                />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky-person">
                  {sortLabel("person", "Person")}
                </th>
                <th className="sticky-team">
                  {sortLabel("team", "Team")}
                </th>
                {totalColumns.map(
                  ({ key, metric, perspective }, index) => (
                    <th
                      className={`sticky-total ${
                        index === totalColumns.length - 1
                          ? "frozen-edge"
                          : ""
                      }`}
                      style={{
                        left: `calc(var(--person-column-width) + var(--team-column-width) + ${
                          index * 5.5
                        }rem)`,
                      }}
                      key={key}
                    >
                      {sortLabel(
                        key,
                        `${
                          perspective === "opponent" ? "Opp " : ""
                        }${analyticsMetricLabels[metric]}`,
                      )}
                    </th>
                  ),
                )}
                {weeks.map((week) => (
                  <th key={week}>
                    {sortLabel(`week:${week}`, `Week ${week}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, index) => (
                <tr
                  className={
                    showPlayoffCutoff &&
                    index === playoffTeamCount - 1
                      ? "playoff-cutoff"
                      : undefined
                  }
                  key={row.franchiseId}
                >
                  <td className="sticky-person">{row.displayName}</td>
                  <td className="sticky-team">{row.teamName}</td>
                  {totalColumns.map(
                    ({ key, metric, perspective }, columnIndex) => {
                      const value = row.totals[perspective][metric];

                      return (
                        <td
                          className={`sticky-total analytics-value-cell ${
                            columnIndex === totalColumns.length - 1
                              ? "frozen-edge"
                              : ""
                          }`}
                          style={{
                            left: `calc(var(--person-column-width) + var(--team-column-width) + ${
                              columnIndex * 5.5
                            }rem)`,
                            backgroundColor: analyticsHeatColor(
                              value,
                              totalRanges.get(key) ?? null,
                            ),
                          }}
                          key={key}
                        >
                          <strong>
                            {formatAnalyticsValue(metric, value)}
                          </strong>
                        </td>
                      );
                    },
                  )}
                  {weeks.map((week) => {
                    const record = row.weeks.get(week);
                    const value =
                      record?.[filters.tablePerspective][
                        filters.tableMetric
                      ];

                    return (
                      <td
                        className="analytics-week-cell analytics-value-cell"
                        style={
                          value === undefined
                            ? undefined
                            : {
                                backgroundColor: analyticsHeatColor(
                                  value,
                                  weeklyRanges.get(week) ?? null,
                                ),
                              }
                        }
                        key={week}
                      >
                        {value === undefined
                          ? "--"
                          : formatAnalyticsValue(
                              filters.tableMetric,
                              value,
                            )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
