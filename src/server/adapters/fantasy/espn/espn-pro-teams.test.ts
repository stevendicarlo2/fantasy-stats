import { describe, expect, it } from "vitest";

import { EspnUnknownProTeamError, resolveEspnProTeam } from "./espn-pro-teams";

describe("resolveEspnProTeam", () => {
  it("resolves a known ESPN proTeamId to its abbreviation and display name", () => {
    expect(resolveEspnProTeam(12)).toEqual({
      abbreviation: "KC",
      displayName: "Kansas City Chiefs",
    });
  });

  it("resolves the highest and lowest assigned proTeamIds", () => {
    expect(resolveEspnProTeam(1)).toEqual({
      abbreviation: "ATL",
      displayName: "Atlanta Falcons",
    });
    expect(resolveEspnProTeam(34)).toEqual({
      abbreviation: "HOU",
      displayName: "Houston Texans",
    });
  });

  it("throws EspnUnknownProTeamError for unassigned ids 31 and 32", () => {
    expect(() => resolveEspnProTeam(31)).toThrow(EspnUnknownProTeamError);
    expect(() => resolveEspnProTeam(32)).toThrow(EspnUnknownProTeamError);
  });

  it("throws EspnUnknownProTeamError for a completely unrecognized proTeamId", () => {
    expect(() => resolveEspnProTeam(999)).toThrow(
      "ESPN referenced an unrecognized NFL proTeamId 999",
    );
  });
});
