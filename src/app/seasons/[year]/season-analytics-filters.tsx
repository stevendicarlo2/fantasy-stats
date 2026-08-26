"use client";

import type {
  CSSProperties,
  Dispatch,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";
import { useRef } from "react";

import {
  analyticsMetrics,
  type AnalyticsFilters,
  type AnalyticsFranchise,
  type AnalyticsMetric,
  type AnalyticsPerspective,
} from "@/application/analytics/season-analytics";

import {
  analyticsMetricLabels,
  perspectiveLabels,
} from "./season-analytics-presentation";

interface WeekRangeSliderProps {
  startWeek: number;
  endWeek: number;
  minimumWeek: number;
  maximumWeek: number;
  onStartWeekChange: (week: number) => void;
  onEndWeekChange: (week: number) => void;
}

export function WeekRangeSlider({
  startWeek,
  endWeek,
  minimumWeek,
  maximumWeek,
  onStartWeekChange,
  onEndWeekChange,
}: WeekRangeSliderProps) {
  const activeHandle = useRef<
    "start" | "end" | "collapsed" | null
  >(null);
  const rangeSpan = maximumWeek - minimumWeek || 1;
  const rangeStyle = {
    "--range-start": `${
      ((startWeek - minimumWeek) / rangeSpan) * 100
    }%`,
    "--range-end": `${((endWeek - minimumWeek) / rangeSpan) * 100}%`,
  } as CSSProperties;

  function weekFromPointer(clientX: number, element: HTMLDivElement) {
    const track = element
      .querySelector(".week-range-track")
      ?.getBoundingClientRect();

    if (!track) {
      return minimumWeek;
    }

    const position = Math.min(
      1,
      Math.max(0, (clientX - track.left) / track.width),
    );

    return Math.round(minimumWeek + position * rangeSpan);
  }

  function updateFromPointer(
    clientX: number,
    element: HTMLDivElement,
    handle: "start" | "end",
  ) {
    const week = weekFromPointer(clientX, element);

    if (handle === "start") {
      onStartWeekChange(Math.min(week, endWeek));
    } else {
      onEndWeekChange(Math.max(startWeek, week));
    }
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const week = weekFromPointer(
      event.clientX,
      event.currentTarget,
    );
    const handle =
      startWeek === endWeek
        ? week < startWeek
          ? "start"
          : week > endWeek
            ? "end"
            : "collapsed"
        : Math.abs(week - startWeek) <= Math.abs(week - endWeek)
          ? "start"
          : "end";

    activeHandle.current = handle;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (handle !== "collapsed") {
      updateFromPointer(event.clientX, event.currentTarget, handle);
    }

    event.preventDefault();
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    let handle = activeHandle.current;

    if (!handle) {
      return;
    }

    if (handle === "collapsed") {
      const week = weekFromPointer(
        event.clientX,
        event.currentTarget,
      );

      if (week === startWeek) {
        return;
      }

      handle = week < startWeek ? "start" : "end";
      activeHandle.current = handle;
    }

    updateFromPointer(event.clientX, event.currentTarget, handle);
  }

  function handlePointerEnd(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    activeHandle.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      <div className="week-range-labels">
        <strong>Week {startWeek}</strong>
        <strong>Week {endWeek}</strong>
      </div>
      <div
        className="week-range-slider"
        style={rangeStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="week-range-track" />
        <input
          className="range-start"
          aria-label="First week"
          type="range"
          style={{
            zIndex: startWeek >= maximumWeek - 1 ? 4 : 2,
          }}
          min={minimumWeek}
          max={maximumWeek}
          value={startWeek}
          onChange={(event) =>
            onStartWeekChange(
              Math.min(Number(event.target.value), endWeek),
            )
          }
        />
        <input
          className="range-end"
          aria-label="Last week"
          type="range"
          min={minimumWeek}
          max={maximumWeek}
          value={endWeek}
          onChange={(event) =>
            onEndWeekChange(
              Math.max(startWeek, Number(event.target.value)),
            )
          }
        />
      </div>
    </>
  );
}

interface SeasonAnalyticsFiltersProps {
  filters: AnalyticsFilters;
  franchises: AnalyticsFranchise[];
  tableUsesFilters: boolean;
  regularSeasonStartWeek: number;
  regularSeasonEndWeek: number;
  defaultFilters: AnalyticsFilters;
  setFilters: Dispatch<SetStateAction<AnalyticsFilters>>;
}

export function SeasonAnalyticsFilters({
  filters,
  franchises,
  tableUsesFilters,
  regularSeasonStartWeek,
  regularSeasonEndWeek,
  defaultFilters,
  setFilters,
}: SeasonAnalyticsFiltersProps) {
  const tableSelection = `${filters.tablePerspective}:${filters.tableMetric}`;
  const tableSelectionOptions = filters.perspectives.flatMap(
    (perspective) =>
      filters.metrics.map((metric) => ({
        metric,
        perspective,
        value: `${perspective}:${metric}`,
      })),
  );

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

  return (
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
        <WeekRangeSlider
          startWeek={filters.startWeek}
          endWeek={filters.endWeek}
          minimumWeek={regularSeasonStartWeek}
          maximumWeek={regularSeasonEndWeek}
          onStartWeekChange={(startWeek) =>
            setFilters((current) => ({ ...current, startWeek }))
          }
          onEndWeekChange={(endWeek) =>
            setFilters((current) => ({ ...current, endWeek }))
          }
        />
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
            Object.keys(perspectiveLabels) as AnalyticsPerspective[]
          ).map((perspective) => (
            <button
              className={
                filters.perspectives.includes(perspective)
                  ? "selected"
                  : ""
              }
              type="button"
              aria-pressed={filters.perspectives.includes(perspective)}
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
          disabled={!tableUsesFilters}
          onChange={(event) => setTableSelection(event.target.value)}
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
  );
}
