// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runSeasonDatasetAction } from "./actions";
import { ImportForm } from "./import-form";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("./actions", () => ({
  runSeasonDatasetAction: vi.fn(),
}));

const runDataset = vi.mocked(runSeasonDatasetAction);

function deferredResult() {
  let resolve: (
    value: Awaited<ReturnType<typeof runSeasonDatasetAction>>,
  ) => void = () => {};
  const promise = new Promise<
    Awaited<ReturnType<typeof runSeasonDatasetAction>>
  >((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

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
  runDataset.mockReset();
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

  it("syncs only selected datasets and reports progress sequentially", async () => {
    const core = deferredResult();
    const rosters = deferredResult();
    runDataset
      .mockReturnValueOnce(core.promise)
      .mockReturnValueOnce(rosters.promise);
    const view = render(
      <ImportForm years={[2025]} importedYears={[2025]} />,
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
        name: "Sync selected datasets",
      }).closest("form")!,
    );

    expect(
      datasetRow(view, "Core season data").getByText("syncing"),
    ).toBeTruthy();
    expect(
      datasetRow(view, "Weekly rosters and projections").getByText("waiting"),
    ).toBeTruthy();
    expect(runDataset).toHaveBeenCalledTimes(1);
    expect(runDataset).toHaveBeenCalledWith({
      dataset: "core",
      operation: "refresh",
      year: 2025,
    });

    await act(async () => {
      core.resolve({
        dataset: "core",
        status: "succeeded",
        message: "core succeeded",
      });
    });
    await waitFor(() => expect(runDataset).toHaveBeenCalledTimes(2));
    expect(
      datasetRow(view, "Weekly rosters and projections").getByText("syncing"),
    ).toBeTruthy();

    await act(async () => {
      rosters.resolve({
        dataset: "rosters",
        status: "succeeded",
        message: "rosters succeeded",
      });
    });
    await waitFor(() =>
      expect(view.getByText("Season 2025 sync completed.")).toBeTruthy(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("allows core to be omitted for an existing season", async () => {
    runDataset.mockResolvedValue({
      dataset: "rosters",
      status: "succeeded",
      message: "rosters succeeded",
    });
    const view = render(
      <ImportForm years={[2025]} importedYears={[2025]} />,
    );
    const labelsToDeselect = [
      "Core season data",
      "Draft picks and transactions",
      "NFL games and player statistics",
    ];

    fireEvent.click(view.getByText("Datasets"));
    for (const label of labelsToDeselect) {
      fireEvent.click(view.getByRole("checkbox", { name: label }));
    }
    expect(view.getByText("1 of 4 datasets")).toBeTruthy();
    fireEvent.submit(
      view.getByRole("button", {
        name: "Sync selected datasets",
      }).closest("form")!,
    );

    await waitFor(() => expect(runDataset).toHaveBeenCalledTimes(1));
    expect(runDataset).toHaveBeenCalledWith({
      dataset: "rosters",
      operation: "refresh",
      year: 2025,
    });
  });
});
