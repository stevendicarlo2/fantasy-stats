// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SeasonAnalyticsDashboard } from "./season-analytics-dashboard";
import { createAnalyticsTestRecords } from "./season-analytics-test-data";

vi.mock("./season-analytics-chart", () => ({
  SeasonAnalyticsChart: () => <div data-testid="analytics-chart" />,
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: text.length * 8 }),
  } as unknown as CanvasRenderingContext2D);
});

describe("SeasonAnalyticsDashboard", () => {
  it("keeps default standings independent and applies people filters on demand", () => {
    const view = render(
      <SeasonAnalyticsDashboard
        records={createAnalyticsTestRecords()}
        playoffTeamCount={3}
        regularSeasonStartWeek={1}
        regularSeasonEndWeek={2}
      />,
    );

    expect(
      view.container.querySelectorAll(".analytics-table tbody tr"),
    ).toHaveLength(7);
    expect(
      view.container.querySelectorAll(".playoff-cutoff"),
    ).toHaveLength(1);
    expect(
      view.container.querySelector(".playoff-cutoff .sticky-person")
        ?.textContent,
    ).toBe("Person 4");

    fireEvent.click(view.getByRole("button", { name: "Clear" }));
    expect(
      view.container.querySelectorAll(".analytics-table tbody tr"),
    ).toHaveLength(7);

    fireEvent.click(
      view.getByRole("button", { name: "Use filtered values" }),
    );
    expect(
      view.getByText("Select at least one person to display standings."),
    ).toBeTruthy();

    fireEvent.click(
      view.getByRole("button", { name: "Default standings" }),
    );
    expect(
      view.container.querySelectorAll(".analytics-table tbody tr"),
    ).toHaveLength(7);
  });
});
