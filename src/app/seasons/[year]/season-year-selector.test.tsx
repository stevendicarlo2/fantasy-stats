// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SeasonYearSelector } from "./season-year-selector";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

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
});
