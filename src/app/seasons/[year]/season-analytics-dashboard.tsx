"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  analyticsHeatColor,
  analyticsMetricLabels,
  analyticsMetrics,
  buildAnalyticsChart,
  createDefaultAnalyticsFilters,
  listAnalyticsFranchises,
  sortAnalyticsSummary,
  summarizeAnalytics,
  type AnalyticsFilters,
  type AnalyticsMetric,
  type AnalyticsPerspective,
  type AnalyticsSortDirection,
  type AnalyticsSortKey,
} from "@/application/analytics/season-analytics";
import type { SeasonAnalyticsRecord } from "@/application/services/season-stats-service";

interface SeasonAnalyticsDashboardProps {
  records: SeasonAnalyticsRecord[];
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
}

const perspectiveLabels: Record<AnalyticsPerspective, string> = {
  team: "Team",
  opponent: "Opponent",
};

type TableMode = "default" | "filtered";

function formatValue(metric: AnalyticsMetric, value: number) {
  const maximumFractionDigits = metric === "score" ? 2 : 1;

  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    useGrouping: false,
  });
}

export function SeasonAnalyticsDashboard({
  records,
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
  const [tableMode, setTableMode] = useState<TableMode>("default");
  const [sort, setSort] = useState<{
    key: AnalyticsSortKey;
    direction: AnalyticsSortDirection;
  }>({ key: "rank", direction: "asc" });
  const activeRangeHandle = useRef<
    "start" | "end" | "collapsed" | null
  >(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const franchises = useMemo(
    () => listAnalyticsFranchises(records),
    [records],
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
  const summary = useMemo(
    () => summarizeAnalytics(records, tableFilters),
    [records, tableFilters],
  );
  const heatSummary = useMemo(
    () =>
      summarizeAnalytics(records, {
        ...tableFilters,
        selectedFranchiseIds: franchises.map(
          (franchise) => franchise.id,
        ),
      }),
    [franchises, records, tableFilters],
  );
  const chart = useMemo(
    () => buildAnalyticsChart(records, filters),
    [filters, records],
  );
  const weeks = Array.from(
    {
      length: tableFilters.endWeek - tableFilters.startWeek + 1,
    },
    (_, index) => tableFilters.startWeek + index,
  );
  const totalColumns = tableFilters.perspectives.flatMap(
    (perspective) =>
      tableFilters.metrics.map((metric) => ({
        key: `total:${perspective}:${metric}` as const,
        metric,
        perspective,
      })),
  );
  const tableStyle = {
    "--person-column-width": "96px",
    "--team-column-width": "192px",
  } as CSSProperties;
  const playoffFranchiseId = summary[5]?.franchiseId;
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
  const sortedSummary = useMemo(
    () =>
      sortAnalyticsSummary(
        summary,
        effectiveSort.key,
        effectiveSort.direction,
        tableFilters.tableMetric,
        tableFilters.tablePerspective,
      ),
    [
      effectiveSort.direction,
      effectiveSort.key,
      summary,
      tableFilters.tableMetric,
      tableFilters.tablePerspective,
    ],
  );
  const hasPointMetrics = filters.metrics.some(
    (metric) => metric !== "score",
  );
  const hasScoreMetric = filters.metrics.includes("score");
  const tableSelection = `${filters.tablePerspective}:${filters.tableMetric}`;
  const tableSelectionOptions = filters.perspectives.flatMap(
    (perspective) =>
      filters.metrics.map((metric) => ({
        metric,
        perspective,
        value: `${perspective}:${metric}`,
      })),
  );
  const rangeSpan =
    regularSeasonEndWeek - regularSeasonStartWeek || 1;
  const rangeStyle = {
    "--range-start": `${
      ((filters.startWeek - regularSeasonStartWeek) / rangeSpan) * 100
    }%`,
    "--range-end": `${
      ((filters.endWeek - regularSeasonStartWeek) / rangeSpan) * 100
    }%`,
  } as CSSProperties;

  useLayoutEffect(() => {
    const table = tableRef.current;

    if (!table) {
      return;
    }

    const context = document
      .createElement("canvas")
      .getContext("2d");

    if (!context) {
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
      `${measure([
        "Person",
        ...franchises.map((franchise) => franchise.displayName),
      ])}px`,
    );
    table.style.setProperty(
      "--team-column-width",
      `${measure([
        "Team",
        ...franchises.map((franchise) => franchise.teamName),
      ])}px`,
    );
  }, [franchises]);

  function toggleFranchise(franchiseId: string) {
    setFilters((current) => ({
      ...current,
      selectedFranchiseIds: current.selectedFranchiseIds.includes(
        franchiseId,
      )
        ? current.selectedFranchiseIds.filter(
            (candidate) => candidate !== franchiseId,
          )
        : [...current.selectedFranchiseIds, franchiseId],
    }));
  }

  function toggleMetric(metric: AnalyticsMetric) {
    setFilters((current) => {
      const selected = current.metrics.includes(metric);

      if (selected && current.metrics.length === 1) {
        return current;
      }

      const metrics = analyticsMetrics.filter((candidate) =>
        candidate === metric
          ? !selected
          : current.metrics.includes(candidate),
      );

      return {
        ...current,
        metrics,
        tableMetric: metrics.includes(current.tableMetric)
          ? current.tableMetric
          : metrics[0],
      };
    });
  }

  function togglePerspective(perspective: AnalyticsPerspective) {
    setFilters((current) => {
      const selected = current.perspectives.includes(perspective);

      if (selected && current.perspectives.length === 1) {
        return current;
      }

      const perspectives = (
        Object.keys(perspectiveLabels) as AnalyticsPerspective[]
      ).filter((candidate) =>
        candidate === perspective
          ? !selected
          : current.perspectives.includes(candidate),
      );

      return {
        ...current,
        perspectives,
        tablePerspective: perspectives.includes(
          current.tablePerspective,
        )
          ? current.tablePerspective
          : perspectives[0],
      };
    });
  }

  function setStartWeek(startWeek: number) {
    setFilters((current) => ({
      ...current,
      startWeek: Math.min(startWeek, current.endWeek),
    }));
  }

  function setEndWeek(endWeek: number) {
    setFilters((current) => ({
      ...current,
      endWeek: Math.max(current.startWeek, endWeek),
    }));
  }

  function weekFromPointer(
    clientX: number,
    element: HTMLDivElement,
  ) {
    const track = element
      .querySelector(".week-range-track")
      ?.getBoundingClientRect();

    if (!track) {
      return regularSeasonStartWeek;
    }

    const position = Math.min(
      1,
      Math.max(0, (clientX - track.left) / track.width),
    );

    return Math.round(
      regularSeasonStartWeek + position * rangeSpan,
    );
  }

  function updateRangeFromPointer(
    clientX: number,
    element: HTMLDivElement,
    handle: "start" | "end",
  ) {
    const week = weekFromPointer(clientX, element);

    if (handle === "start") {
      setStartWeek(week);
    } else {
      setEndWeek(week);
    }
  }

  function startRangePointer(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const week = weekFromPointer(
      event.clientX,
      event.currentTarget,
    );
    const handle =
      filters.startWeek === filters.endWeek
        ? week < filters.startWeek
          ? "start"
          : week > filters.endWeek
            ? "end"
            : "collapsed"
        : Math.abs(week - filters.startWeek) <=
            Math.abs(week - filters.endWeek)
          ? "start"
          : "end";

    activeRangeHandle.current = handle;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (handle !== "collapsed") {
      updateRangeFromPointer(
        event.clientX,
        event.currentTarget,
        handle,
      );
    }
    event.preventDefault();
  }

  function moveRangePointer(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    let handle = activeRangeHandle.current;

    if (!handle) {
      return;
    }

    if (handle === "collapsed") {
      const week = weekFromPointer(
        event.clientX,
        event.currentTarget,
      );

      if (week === filters.startWeek) {
        return;
      }

      handle = week < filters.startWeek ? "start" : "end";
      activeRangeHandle.current = handle;
    }

    updateRangeFromPointer(
      event.clientX,
      event.currentTarget,
      handle,
    );
  }

  function stopRangePointer(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    activeRangeHandle.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function setTableSelection(value: string) {
    const [perspective, metric] = value.split(":") as [
      AnalyticsPerspective,
      AnalyticsMetric,
    ];

    setFilters((current) => ({
      ...current,
      tableMetric: metric,
      tablePerspective: perspective,
    }));
  }

  function weeklyHeatValues(
    week: number,
    metric: AnalyticsMetric,
    perspective: "team" | "opponent",
  ) {
    return records
      .filter((record) => record.week === week)
      .map((record) => record[perspective][metric]);
  }

  function totalHeatValues(
    metric: AnalyticsMetric,
    perspective: AnalyticsPerspective,
  ) {
    return heatSummary.map(
      (row) => row.totals[perspective][metric],
    );
  }

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

  return (
    <section className="analytics-section">
      <div className="analytics-heading">
        <div>
          <p className="panel-kicker">Season analytics</p>
          <h2>Adjusted NASCAR standings</h2>
        </div>
      </div>

      <div className="analytics-filters">
        <fieldset className="filter-group team-filter">
          <legend>People</legend>
          <div className="filter-actions">
            <button
              className="filter-link"
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  selectedFranchiseIds: franchises.map(
                    (franchise) => franchise.id,
                  ),
                }))
              }
            >
              Select all
            </button>
            <button
              className="filter-link"
              type="button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  selectedFranchiseIds: [],
                }))
              }
            >
              Clear
            </button>
          </div>
          <div className="filter-chips">
            {franchises.map((franchise) => {
              const selected =
                filters.selectedFranchiseIds.includes(franchise.id);
              return (
                <button
                  className={`filter-chip ${selected ? "selected" : ""}`}
                  type="button"
                  aria-pressed={selected}
                  key={franchise.id}
                  onClick={() => toggleFranchise(franchise.id)}
                >
                  {franchise.displayName}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Weeks</legend>
          <div className="week-range-labels">
            <strong>Week {filters.startWeek}</strong>
            <strong>Week {filters.endWeek}</strong>
          </div>
          <div
            className="week-range-slider"
            style={rangeStyle}
            onPointerDown={startRangePointer}
            onPointerMove={moveRangePointer}
            onPointerUp={stopRangePointer}
            onPointerCancel={stopRangePointer}
          >
            <div className="week-range-track" />
            <input
              className="range-start"
              aria-label="First week"
              type="range"
              style={{
                zIndex:
                  filters.startWeek >= regularSeasonEndWeek - 1
                    ? 4
                    : 2,
              }}
              min={regularSeasonStartWeek}
              max={regularSeasonEndWeek}
              value={filters.startWeek}
              onChange={(event) =>
                setStartWeek(Number(event.target.value))
              }
            />
            <input
              className="range-end"
              aria-label="Last week"
              type="range"
              min={regularSeasonStartWeek}
              max={regularSeasonEndWeek}
              value={filters.endWeek}
              onChange={(event) =>
                setEndWeek(Number(event.target.value))
              }
            />
          </div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Metrics</legend>
          <div className="segmented-control">
            {analyticsMetrics.map((metric) => (
              <button
                className={
                  filters.metrics.includes(metric) ? "selected" : ""
                }
                type="button"
                aria-pressed={filters.metrics.includes(metric)}
                key={metric}
                onClick={() => toggleMetric(metric)}
              >
                {analyticsMetricLabels[metric]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Perspective</legend>
          <div className="segmented-control">
            {(
              Object.keys(
                perspectiveLabels,
              ) as AnalyticsPerspective[]
            ).map((perspective) => (
              <button
                className={
                  filters.perspectives.includes(perspective)
                    ? "selected"
                    : ""
                }
                type="button"
                aria-pressed={filters.perspectives.includes(
                  perspective,
                )}
                key={perspective}
                onClick={() => togglePerspective(perspective)}
              >
                {perspectiveLabels[perspective]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Weekly table value</legend>
          <select
            value={tableSelection}
            disabled={tableMode === "default"}
            onChange={(event) =>
              setTableSelection(event.target.value)
            }
          >
            {tableSelectionOptions.map(
              ({ metric, perspective, value }) => (
                <option key={value} value={value}>
                  {analyticsMetricLabels[metric]} ·{" "}
                  {perspectiveLabels[perspective]}
                </option>
              ),
            )}
          </select>
        </fieldset>

        <button
          className="secondary filter-reset-button"
          type="button"
          onClick={() => setFilters(defaultFilters)}
        >
          Reset filters
        </button>
      </div>

      <article className="panel analytics-table-panel">
        <div className="analytics-subheading">
          <div>
            <p className="panel-kicker">
              {tableMode === "default"
                ? "Default standings"
                : "Filtered standings"}
            </p>
            <h2>
              Weeks {tableFilters.startWeek}-{tableFilters.endWeek}
            </h2>
          </div>
          <div className="segmented-control table-mode-toggle">
            <button
              className={tableMode === "default" ? "selected" : ""}
              type="button"
              aria-pressed={tableMode === "default"}
              onClick={() => setTableMode("default")}
            >
              Default standings
            </button>
            <button
              className={tableMode === "filtered" ? "selected" : ""}
              type="button"
              aria-pressed={tableMode === "filtered"}
              onClick={() => setTableMode("filtered")}
            >
              Use filtered values
            </button>
          </div>
        </div>

        {summary.length === 0 ? (
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
                        style={
                          {
                            left: `calc(var(--person-column-width) + var(--team-column-width) + ${
                              index * 5.5
                            }rem)`,
                          } as CSSProperties
                        }
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
                {sortedSummary.map((row) => (
                  <tr
                    className={
                      tableMode === "default" &&
                      row.franchiseId === playoffFranchiseId
                        ? "playoff-cutoff"
                        : undefined
                    }
                    key={row.franchiseId}
                  >
                    <td className="sticky-person">
                      {row.displayName}
                    </td>
                    <td className="sticky-team">{row.teamName}</td>
                    {totalColumns.map(
                      ({ key, metric, perspective }, index) => {
                        const value =
                          row.totals[perspective][metric];

                        return (
                          <td
                            className={`sticky-total analytics-value-cell ${
                              index === totalColumns.length - 1
                                ? "frozen-edge"
                                : ""
                            }`}
                            style={
                              {
                                left: `calc(var(--person-column-width) + var(--team-column-width) + ${
                                  index * 5.5
                                }rem)`,
                                backgroundColor: analyticsHeatColor(
                                  value,
                                  totalHeatValues(
                                    metric,
                                    perspective,
                                  ),
                                ),
                              } as CSSProperties
                            }
                            key={key}
                          >
                            <strong>
                              {formatValue(metric, value)}
                            </strong>
                          </td>
                        );
                      },
                    )}
                    {weeks.map((week) => {
                      const record = row.weeks.get(week);
                      const value =
                        record?.[tableFilters.tablePerspective][
                          tableFilters.tableMetric
                        ];

                      return (
                        <td
                          className="analytics-week-cell analytics-value-cell"
                          style={
                            value !== undefined
                              ? {
                                  backgroundColor: analyticsHeatColor(
                                    value,
                                    weeklyHeatValues(
                                      week,
                                      tableFilters.tableMetric,
                                      tableFilters.tablePerspective,
                                    ),
                                  ),
                                }
                              : undefined
                          }
                          key={week}
                        >
                          {value !== undefined ? (
                            <span>
                              {formatValue(
                                tableFilters.tableMetric,
                                value,
                              )}
                            </span>
                          ) : (
                            "--"
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

      <article className="panel analytics-chart-panel">
        <div className="analytics-subheading">
          <div>
            <p className="panel-kicker">Weekly trends</p>
            <h2>Scores over time</h2>
          </div>
          <span>{chart.series.length} visible series</span>
        </div>
        {chart.series.length === 0 ? (
          <p>Select at least one person to display the chart.</p>
        ) : (
          <div className="chart-container">
            <div className="chart-legend" aria-label="Chart series">
              {chart.series.map((series) => (
                <div className="chart-legend-item" key={series.key}>
                  <span
                    className={`chart-line-sample ${series.metric}`}
                    style={{
                      color: series.color,
                      opacity: series.opacity,
                    }}
                  />
                  <span>{series.label}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={430}>
              <LineChart
                data={chart.points}
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
                {chart.series.map((series) => (
                  <Line
                    type="linear"
                    dataKey={series.key}
                    name={series.label}
                    yAxisId={
                      series.metric === "score" ? "score" : "points"
                    }
                    stroke={series.color}
                    strokeWidth={3}
                    strokeOpacity={series.opacity}
                    strokeDasharray={series.dash}
                    dot={{
                      r: 2.5,
                      fill: series.color,
                      fillOpacity: series.opacity,
                      strokeOpacity: series.opacity,
                    }}
                    activeDot={{
                      r: 5,
                      fillOpacity: series.opacity,
                      strokeOpacity: series.opacity,
                    }}
                    connectNulls={false}
                    isAnimationActive={false}
                    key={series.key}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>
    </section>
  );
}
