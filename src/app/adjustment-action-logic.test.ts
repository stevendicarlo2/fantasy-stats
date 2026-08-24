import { describe, expect, it, vi } from "vitest";

import { executeAdjustmentAction } from "./adjustment-action-logic";

const ids = {
  matchup: "11111111-1111-4111-8111-111111111111",
  franchise: "22222222-2222-4222-8222-222222222222",
  override: "33333333-3333-4333-8333-333333333333",
};

describe("executeAdjustmentAction", () => {
  it("validates and saves an additive adjustment", async () => {
    const service = {
      saveAdjustment: vi.fn().mockResolvedValue({}),
      deleteAdjustment: vi.fn(),
    };
    const formData = new FormData();
    formData.set("operation", "save");
    formData.set("seasonYear", "2025");
    formData.set("target", `${ids.matchup}:${ids.franchise}`);
    formData.set("scoreAdjustment", "-1.25");
    formData.set("reason", "  Stat correction  ");

    await expect(
      executeAdjustmentAction(formData, () => service),
    ).resolves.toEqual({
      status: "success",
      message: "Matchup adjustment saved",
      seasonYear: 2025,
    });
    expect(service.saveAdjustment).toHaveBeenCalledWith({
      seasonYear: 2025,
      matchupId: ids.matchup,
      franchiseId: ids.franchise,
      scoreAdjustment: -1.25,
      reason: "Stat correction",
    });
  });

  it("deletes a validated season adjustment", async () => {
    const service = {
      saveAdjustment: vi.fn(),
      deleteAdjustment: vi.fn().mockResolvedValue(undefined),
    };
    const formData = new FormData();
    formData.set("operation", "delete");
    formData.set("seasonYear", "2025");
    formData.set("matchupOverrideId", ids.override);

    await expect(
      executeAdjustmentAction(formData, () => service),
    ).resolves.toMatchObject({
      status: "success",
      seasonYear: 2025,
    });
    expect(service.deleteAdjustment).toHaveBeenCalledWith(
      2025,
      ids.override,
    );
  });

  it("returns a safe validation error for malformed input", async () => {
    const formData = new FormData();
    formData.set("operation", "save");
    formData.set("seasonYear", "2025");
    formData.set("target", "invalid");
    formData.set("scoreAdjustment", "1.234");
    formData.set("reason", "");

    await expect(
      executeAdjustmentAction(formData, () => {
        throw new Error("Service should not be loaded");
      }),
    ).resolves.toEqual({
      status: "error",
      message: "Choose a valid matchup score",
      seasonYear: 2025,
    });
  });
});
