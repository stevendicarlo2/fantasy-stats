// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pollSeasonDatasetSync,
  startSeasonDatasetSync,
} from "./actions";
import { ImportForm } from "./import-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("./actions", () => ({
  pollSeasonDatasetSync: vi.fn(),
  startSeasonDatasetSync: vi.fn(),
}));

const startDataset = vi.mocked(startSeasonDatasetSync);
const pollDataset = vi.mocked(pollSeasonDatasetSync);

function datasetRow(
  view: ReturnType<typeof render>,
  label: string,
) {
  const row = view.getByText(label).closest("label");
  if (!row) {
    throw new Error(`Missing dataset row for ${label}`);
  }
  return within(row);
}

afterEach(() => {
  cleanup();
  refresh.mockReset();
  startDataset.mockReset();
  pollDataset.mockReset();
});

describe("ImportForm", () => {
  it("requires core for a new season and defaults every dataset on", () => {
    const view = render(
      <ImportForm years={[2025, 2024]} importedYears={[2024]} />,
    );
    const details = view.container.querySelector("details");

    expect(details?.open).toBe(false);
    expect(view.getByText("All datasets")).toBeTruthy();
    const checkboxes = view.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
    expect(checkboxes[0].disabled).toBe(true);
    expect(
      datasetRow(view, "Core season data").getByText("required"),
    ).toBeTruthy();
  });

  it("imports only selected datasets in dependency order", async () => {
    startDataset.mockImplementation(async ({ dataset }) => ({
      dataset,
      runId: `${dataset}-run`,
      status: "succeeded",
      message: `${dataset} succeeded`,
      pollAfterMs: null,
    }));
    const view = render(
      <ImportForm years={[2025]} importedYears={[]} />,
    );

    fireEvent.click(view.getByText("Datasets"));
    fireEvent.click(
      view.getByRole("checkbox", {
        name: "Draft picks and transactions",
      }),
    );
    fireEvent.click(
      view.getByRole("checkbox", {
        name: "NFL games and player statistics",
      }),
    );
    fireEvent.submit(
      view.getByRole("button", {
        name: "Import selected",
      }).closest("form")!,
    );

    await waitFor(() => expect(startDataset).toHaveBeenCalledTimes(2));
    expect(startDataset).toHaveBeenNthCalledWith(1, {
      dataset: "core",
      operation: "import",
      year: 2025,
    });
    expect(startDataset).toHaveBeenNthCalledWith(2, {
      dataset: "rosters",
      operation: "import",
      year: 2025,
    });
    await waitFor(() =>
      expect(view.getByText("Season 2025 sync completed.")).toBeTruthy(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("does not offer an already imported season", () => {
    const view = render(
      <ImportForm years={[2025]} importedYears={[2025]} />,
    );

    expect(
      view.getByText("Every configured season has been imported."),
    ).toBeTruthy();
  });
});
