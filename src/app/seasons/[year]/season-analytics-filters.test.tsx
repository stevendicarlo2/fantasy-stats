// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultAnalyticsFilters,
  listAnalyticsFranchises,
  type AnalyticsFilters,
} from "@/application/analytics/season-analytics";

import {
  SeasonAnalyticsFilters,
  WeekRangeSlider,
} from "./season-analytics-filters";
import { createAnalyticsTestRecords } from "./season-analytics-test-data";

beforeEach(() => {
  globalThis.PointerEvent =
    MouseEvent as unknown as typeof PointerEvent;
});

describe("WeekRangeSlider", () => {
  it("separates collapsed handles in either drag direction", () => {
    const onStartWeekChange = vi.fn();
    const onEndWeekChange = vi.fn();
    const view = render(
      <WeekRangeSlider
        startWeek={7}
        endWeek={7}
        minimumWeek={1}
        maximumWeek={14}
        onStartWeekChange={onStartWeekChange}
        onEndWeekChange={onEndWeekChange}
      />,
    );
    const slider = view.container.querySelector(
      ".week-range-slider",
    ) as HTMLDivElement;
    const track = view.container.querySelector(
      ".week-range-track",
    ) as HTMLDivElement;
    slider.setPointerCapture = vi.fn();
    slider.hasPointerCapture = vi.fn(() => true);
    slider.releasePointerCapture = vi.fn();
    track.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          width: 130,
        }) as DOMRect,
    );

    fireEvent.pointerDown(slider, { clientX: 60, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 40, pointerId: 1 });
    expect(onStartWeekChange).toHaveBeenLastCalledWith(5);

    fireEvent.pointerUp(slider, { pointerId: 1 });
    fireEvent.pointerDown(slider, { clientX: 60, pointerId: 2 });
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 2 });
    expect(onEndWeekChange).toHaveBeenLastCalledWith(9);
  });
});

describe("SeasonAnalyticsFilters", () => {
  it("keeps at least one metric and perspective selected", () => {
    const records = createAnalyticsTestRecords(2);
    const defaults = createDefaultAnalyticsFilters(records, 1, 2);

    function Harness() {
      const [filters, setFilters] =
        useState<AnalyticsFilters>(defaults);

      return (
        <SeasonAnalyticsFilters
          filters={filters}
          franchises={listAnalyticsFranchises(records)}
          tableUsesFilters
          regularSeasonStartWeek={1}
          regularSeasonEndWeek={2}
          defaultFilters={defaults}
          setFilters={setFilters}
        />
      );
    }

    const view = render(<Harness />);
    const anp = view.getByRole("button", { name: "ANP" });
    const team = view.getByRole("button", { name: "Team" });

    fireEvent.click(anp);
    fireEvent.click(team);

    expect(anp.getAttribute("aria-pressed")).toBe("true");
    expect(team.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(view.getByRole("button", { name: "NP" }));
    fireEvent.click(anp);
    expect(anp.getAttribute("aria-pressed")).toBe("false");
  });
});
