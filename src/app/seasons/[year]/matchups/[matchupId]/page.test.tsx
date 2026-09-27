// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
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
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/server/runtime/web-runtime", () => ({
  getWebRuntime: vi.fn(),
}));

afterEach(cleanup);

describe("MatchupRosterPage", () => {
  it("renders a side-by-side comparison with starters, bench, and IR", async () => {
    vi.mocked(getWebRuntime).mockResolvedValue({
      seasonDataQueryService: {
        getMatchupPage: vi.fn().mockResolvedValue({
          sync: { isSyncing: false, revision: "", pollAfterMs: null },
          data: {
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
                      displayName: "Home Starter",
                      lineupSlot: "QB",
                      rosterOrder: 0,
                      actualFantasyPoints: 20,
                      projectedFantasyPoints: 18.5,
                      position: "QB",
                      nflTeamAbbreviation: "SF",
                      game: {
                        opponentAbbreviation: "LAR",
                        isHomeGame: false,
                        startsAt: "2025-12-14T18:00:00Z",
                        completed: true,
                        stats: null,
                      },
                    },
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000004",
                      playerKind: "athlete",
                      displayName: "Home Bench Player",
                      lineupSlot: "BE",
                      rosterOrder: 1,
                      actualFantasyPoints: 7,
                      projectedFantasyPoints: null,
                      position: "WR",
                      nflTeamAbbreviation: "SF",
                      game: null,
                    },
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000005",
                      playerKind: "athlete",
                      displayName: "Home IR Player",
                      lineupSlot: "IR",
                      rosterOrder: 2,
                      actualFantasyPoints: 0,
                      projectedFantasyPoints: 1,
                      position: "RB",
                      nflTeamAbbreviation: "SF",
                      game: null,
                    },
                  ],
                },
                {
                  franchiseId:
                    "10000000-0000-4000-8000-000000000006",
                  franchiseName: "Away Team",
                  ownerName: null,
                  matchupSide: "away",
                  effectiveScore: 90.25,
                  rosterState: "final",
                  players: [
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000007",
                      playerKind: "athlete",
                      displayName: "Away Starter",
                      lineupSlot: "QB",
                      rosterOrder: 0,
                      actualFantasyPoints: 0,
                      projectedFantasyPoints: 15,
                      position: "QB",
                      nflTeamAbbreviation: "IND",
                      game: {
                        opponentAbbreviation: "BAL",
                        isHomeGame: true,
                        startsAt: "2099-12-14T18:00:00Z",
                        completed: false,
                        stats: null,
                      },
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
          },
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
    expect(view.getByText("Home Team")).toBeTruthy();
    expect(view.getByText("Away Team")).toBeTruthy();
    expect(view.getByText("Show projected")).toBeTruthy();
    expect(view.getByText("Home Starter")).toBeTruthy();
    expect(view.getByText("Away Starter")).toBeTruthy();
    // Home starter's game is final: shows Final with no score.
    expect(view.getByText("@LAR Final")).toBeTruthy();
    // Away starter hasn't kicked off yet: opponent + kickoff time, no
    // fantasy points shown yet.
    expect(view.getByText(/vs BAL,/)).toBeTruthy();
    // Bench/IR players with no game show BYE, and blank opposing cells
    // show "--".
    expect(view.getAllByText("BYE").length).toBeGreaterThan(0);
    expect(view.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("shows a separate faded projected column when toggled client-side, without replacing actual scores", async () => {
    vi.mocked(getWebRuntime).mockResolvedValue({
      seasonDataQueryService: {
        getMatchupPage: vi.fn().mockResolvedValue({
          sync: { isSyncing: false, revision: "", pollAfterMs: null },
          data: {
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
                  rosterState: "final",
                  players: [
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000003",
                      playerKind: "athlete",
                      displayName: "Home Starter",
                      lineupSlot: "QB",
                      rosterOrder: 0,
                      actualFantasyPoints: 20,
                      projectedFantasyPoints: 18.5,
                      position: "QB",
                      nflTeamAbbreviation: "SF",
                      game: {
                        opponentAbbreviation: "LAR",
                        isHomeGame: false,
                        startsAt: "2025-12-14T18:00:00Z",
                        completed: true,
                        stats: null,
                      },
                    },
                  ],
                },
                {
                  franchiseId:
                    "10000000-0000-4000-8000-000000000006",
                  franchiseName: "Away Team",
                  ownerName: null,
                  matchupSide: "away",
                  effectiveScore: 0,
                  rosterState: "final",
                  players: [
                    {
                      playerId:
                        "10000000-0000-4000-8000-000000000007",
                      playerKind: "athlete",
                      displayName: "Away Starter",
                      lineupSlot: "QB",
                      rosterOrder: 0,
                      actualFantasyPoints: 0,
                      projectedFantasyPoints: 15,
                      position: "QB",
                      nflTeamAbbreviation: "IND",
                      game: {
                        opponentAbbreviation: "BAL",
                        isHomeGame: true,
                        startsAt: "2099-12-14T18:00:00Z",
                        completed: false,
                        stats: null,
                      },
                    },
                  ],
                },
              ],
            },
          ],
          },
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

    // Before toggling, no projected column is rendered, and the
    // headline scores show actual/effective points only.
    expect(view.queryByText("15.00")).toBeNull();
    expect(view.getByText("125.50")).toBeTruthy();

    // Toggling client-side (no navigation) reveals the pregame
    // projection as an additional column alongside actual points.
    fireEvent.click(view.getByText("Show projected"));

    // Away starter's actual points ("--", hasn't kicked off) remain
    // untouched; the projected column adds "15.00" separately.
    expect(view.getByText("15.00")).toBeTruthy();
    expect(view.getByText("18.50")).toBeTruthy();
    expect(view.getAllByText("--").length).toBeGreaterThan(0);
    // The headline score is unaffected by the toggle (stays actual).
    expect(view.getByText("125.50")).toBeTruthy();

    // Toggling back (clicking the same button again) removes the
    // projected column.
    fireEvent.click(view.getByText("Show projected"));
    expect(view.queryByText("15.00")).toBeNull();
  });

  it("shows an unavailable message when no roster data exists for the period", async () => {
    vi.mocked(getWebRuntime).mockResolvedValue({
      seasonDataQueryService: {
        getMatchupPage: vi.fn().mockResolvedValue({
          sync: { isSyncing: false, revision: "", pollAfterMs: null },
          data: {
          matchupId: "10000000-0000-4000-8000-000000000001",
          seasonYear: 2025,
          matchupPeriod: 1,
          phase: "regular",
          periods: [{ scoringPeriod: 1, teams: [] }],
          },
        }),
      },
    } as unknown as Awaited<ReturnType<typeof getWebRuntime>>);

    const page = await MatchupRosterPage({
      params: Promise.resolve({
        year: "2025",
        matchupId: "10000000-0000-4000-8000-000000000001",
      }),
      searchParams: Promise.resolve({ period: "1" }),
    });
    const view = render(page);

    expect(
      view.getByText(
        "No weekly roster snapshot has been imported for this matchup.",
      ),
    ).toBeTruthy();
  });
});
