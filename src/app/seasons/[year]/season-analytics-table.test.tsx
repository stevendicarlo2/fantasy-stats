// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultAnalyticsFilters,
  summarizeAnalytics,
  type AnalyticsFilters,
} from "@/application/analytics/season-analytics";

import { SeasonAnalyticsTable } from "./season-analytics-table";
import { createAnalyticsTestRecords } from "./season-analytics-test-data";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: text.length * 8 }),
  } as unknown as CanvasRenderingContext2D);
});

describe("SeasonAnalyticsTable", () => {
  it("shows the configured cutoff only for default standings order", () => {
    const records = createAnalyticsTestRecords();
    const filters: AnalyticsFilters = {
      ...createDefaultAnalyticsFilters(records, 1, 2),
      metrics: ["np", "anp"],
      perspectives: ["team", "opponent"],
    };
    const rows = summarizeAnalytics(records, filters);
    const view = render(
      <SeasonAnalyticsTable
        mode="default"
        onModeChange={vi.fn()}
        filters={filters}
        rows={rows}
        heatRows={rows}
        records={records}
        playoffTeamCount={3}
      />,
    );

    expect(view.container.querySelectorAll(".playoff-cutoff")).toHaveLength(
      1,
    );
    expect(
      view.container.querySelector(".playoff-cutoff .sticky-person")
        ?.textContent,
    ).toBe(rows[2].displayName);

    fireEvent.click(
      view.getByRole("button", { name: "Sort by Opp NP" }),
    );
    expect(view.container.querySelectorAll(".playoff-cutoff")).toHaveLength(
      0,
    );

    fireEvent.click(
      view.getByRole("button", { name: /^Sort by ANP$/ }),
    );
    expect(view.container.querySelectorAll(".playoff-cutoff")).toHaveLength(
      1,
    );

    const fallbackFilters: AnalyticsFilters = {
      ...filters,
      perspectives: ["team"],
    };
    const fallbackRows = summarizeAnalytics(
      records,
      fallbackFilters,
    );

    view.rerender(
      <SeasonAnalyticsTable
        mode="filtered"
        onModeChange={vi.fn()}
        filters={fallbackFilters}
        rows={fallbackRows}
        heatRows={fallbackRows}
        records={records}
        playoffTeamCount={3}
      />,
    );
    expect(view.container.querySelectorAll(".playoff-cutoff")).toHaveLength(
      0,
    );
    expect(
      view.container.querySelector(
        ".analytics-table tbody tr:first-child .sticky-person",
      )?.textContent,
    ).toBe(fallbackRows[0].displayName);

    view.rerender(
      <SeasonAnalyticsTable
        mode="default"
        onModeChange={vi.fn()}
        filters={fallbackFilters}
        rows={fallbackRows}
        heatRows={fallbackRows}
        records={records}
        playoffTeamCount={null}
      />,
    );
    expect(view.container.querySelectorAll(".playoff-cutoff")).toHaveLength(
      0,
    );
  });
});
