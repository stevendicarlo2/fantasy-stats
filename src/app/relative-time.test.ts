import { describe, expect, it } from "vitest";

import { formatRelative } from "./relative-time";

describe("formatRelative", () => {
  it("formats elapsed timestamps in the past", () => {
    expect(
      formatRelative(
        "2026-09-27T20:00:00.000Z",
        Date.parse("2026-09-27T20:00:30.000Z"),
      ),
    ).toBe("30 seconds ago");
  });

  it("clamps small clock skew instead of showing a future time", () => {
    expect(
      formatRelative(
        "2026-09-27T20:00:05.000Z",
        Date.parse("2026-09-27T20:00:00.000Z"),
      ),
    ).toBe("now");
  });
});
