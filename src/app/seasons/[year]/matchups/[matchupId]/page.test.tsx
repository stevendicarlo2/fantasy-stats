// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getWebRuntime } from "@/server/runtime/web-runtime";

import MatchupRosterPage from "./page";

vi.mock("next/server", () => ({
  connection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found");
  }),
}));

vi.mock("@/server/runtime/web-runtime", () => ({
  getWebRuntime: vi.fn(),
}));

afterEach(cleanup);

describe("MatchupRosterPage", () => {
  it("renders multi-week provisional bye rosters by lineup group", async () => {
    vi.mocked(getWebRuntime).mockResolvedValue({
      matchupRosterService: {
        getMatchupRoster: vi.fn().mockResolvedValue({
          matchupId: "10000000-0000-4000-8000-000000000001",
          seasonYear: 2025,
          matchupPeriod: 15,
          phase: "playoff",
          periods: [
            {
              scoringPeriod: 15,
              teams: [
                {
                  franchiseId:
                    "10000000-0000-4000-8000-000000000002",
                  franchiseName: "Home Team",
                  ownerName: null,
                  matchupSide: "home",
                  effectiveScore: 125.5,
                  rosterState: "provisional",
                  players: [
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000003",
                      playerKind: "athlete",
                      displayName: "Starter",
                      lineupSlot: "QB",
                      rosterOrder: 0,
                      actualFantasyPoints: 20,
                      projectedFantasyPoints: 18.5,
                    },
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000004",
                      playerKind: "athlete",
                      displayName: "Bench Player",
                      lineupSlot: "BE",
                      rosterOrder: 1,
                      actualFantasyPoints: 7,
                      projectedFantasyPoints: null,
                    },
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000005",
                      playerKind: "athlete",
                      displayName: "IR Player",
                      lineupSlot: "IR",
                      rosterOrder: 2,
                      actualFantasyPoints: 0,
                      projectedFantasyPoints: 1,
                    },
                  ],
                },
              ],
            },
            {
              scoringPeriod: 16,
              teams: [],
            },
          ],
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getWebRuntime>>);

    const page = await MatchupRosterPage({
      params: Promise.resolve({
        year: "2025",
        matchupId: "10000000-0000-4000-8000-000000000001",
      }),
      searchParams: Promise.resolve({ period: "15" }),
    });
    const view = render(page);

    expect(view.getByText("Week 15")).toBeTruthy();
    expect(view.getByText("Week 16")).toBeTruthy();
    expect(view.getAllByText("Home Team")).toHaveLength(2);
    expect(view.getByText("Starters")).toBeTruthy();
    expect(view.getByText("Bench")).toBeTruthy();
    expect(view.getByText("Injured reserve")).toBeTruthy();
    expect(
      view.getByText(
        "This lineup is provisional and may change on refresh.",
      ),
    ).toBeTruthy();
    expect(view.getByText("--")).toBeTruthy();
  });
});
