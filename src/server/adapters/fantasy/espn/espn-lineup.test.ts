import { describe, expect, it } from "vitest";

import {
  EspnUnknownLineupSlotError,
  isEspnTeamDefense,
  resolveEspnCanonicalPosition,
  resolveEspnLineupSlot,
} from "./espn-lineup";

describe("resolveEspnLineupSlot", () => {
  it("resolves every known ESPN lineup slot id", () => {
    expect(resolveEspnLineupSlot(0)).toBe("QB");
    expect(resolveEspnLineupSlot(2)).toBe("RB");
    expect(resolveEspnLineupSlot(4)).toBe("WR");
    expect(resolveEspnLineupSlot(6)).toBe("TE");
    expect(resolveEspnLineupSlot(7)).toBe("OP");
    expect(resolveEspnLineupSlot(16)).toBe("DST");
    expect(resolveEspnLineupSlot(17)).toBe("K");
    expect(resolveEspnLineupSlot(20)).toBe("BE");
    expect(resolveEspnLineupSlot(21)).toBe("IR");
    expect(resolveEspnLineupSlot(23)).toBe("FLEX");
  });

  it("throws EspnUnknownLineupSlotError for an unrecognized lineup slot id", () => {
    expect(() => resolveEspnLineupSlot(999)).toThrow(
      EspnUnknownLineupSlotError,
    );
    expect(() => resolveEspnLineupSlot(999)).toThrow(
      "ESPN roster entry has an unrecognized lineup slot 999",
    );
  });
});

describe("resolveEspnCanonicalPosition", () => {
  it("resolves every known canonical position id", () => {
    expect(resolveEspnCanonicalPosition(1)).toBe("QB");
    expect(resolveEspnCanonicalPosition(2)).toBe("RB");
    expect(resolveEspnCanonicalPosition(3)).toBe("WR");
    expect(resolveEspnCanonicalPosition(4)).toBe("TE");
    expect(resolveEspnCanonicalPosition(5)).toBe("K");
    expect(resolveEspnCanonicalPosition(16)).toBe("DST");
  });

  it("returns null instead of throwing for an unmodeled position id", () => {
    expect(resolveEspnCanonicalPosition(999)).toBeNull();
  });
});

describe("isEspnTeamDefense", () => {
  it("returns true for the DST default position id", () => {
    expect(isEspnTeamDefense(16)).toBe(true);
  });

  it("returns false for any other default position id", () => {
    expect(isEspnTeamDefense(1)).toBe(false);
  });
});
