// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeasonYearSelector } from "./season-year-selector";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("SeasonYearSelector", () => {
  it("shows every imported season and navigates when the year changes", () => {
    const view = render(
      <SeasonYearSelector
        availableYears={[2025, 2023, 2021]}
        currentYear={2023}
      />,
    );
    const selector = view.getByRole("combobox", {
      name: "Season",
    }) as HTMLSelectElement;

    expect(selector.value).toBe("2023");
    expect(
      [...selector.querySelectorAll("option")].map(
        (option) => option.textContent,
      ),
    ).toEqual(["2025", "2023", "2021"]);

    fireEvent.change(selector, { target: { value: "2021" } });

    expect(push).toHaveBeenCalledWith("/seasons/2021");
  });

  it("preserves a page suffix when changing seasons", () => {
    const view = render(
      <SeasonYearSelector
        availableYears={[2025, 2023]}
        currentYear={2025}
        pathSuffix="/adjustments"
      />,
    );

    fireEvent.change(
      view.getByRole("combobox", { name: "Season" }),
      { target: { value: "2023" } },
    );

    expect(push).toHaveBeenCalledWith("/seasons/2023/adjustments");
  });
});
