import { describe, expect, it, vi } from "vitest";

import { FranchiseDisplayNameService } from "./franchise-display-name-service";

const franchiseId = "11111111-1111-4111-8111-111111111111";

describe("FranchiseDisplayNameService", () => {
  it("saves a validated name for an imported franchise", async () => {
    const database = {
      listFranchiseDisplayNames: vi.fn(),
      saveFranchiseDisplayName: vi.fn(async (displayName) => displayName),
    };
    const service = new FranchiseDisplayNameService(database);

    await expect(
      service.setDisplayName(franchiseId, "  Person One  "),
    ).resolves.toEqual({
      franchiseId,
      displayName: "Person One",
    });
  });

  it("rejects invalid display names before persistence", async () => {
    const database = {
      listFranchiseDisplayNames: vi.fn(),
      saveFranchiseDisplayName: vi.fn(),
    };
    const service = new FranchiseDisplayNameService(database);

    await expect(
      service.setDisplayName(franchiseId, " "),
    ).rejects.toThrow();
    expect(database.saveFranchiseDisplayName).not.toHaveBeenCalled();
  });
});
