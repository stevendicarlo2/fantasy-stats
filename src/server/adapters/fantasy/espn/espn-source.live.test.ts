import { describe, expect, it } from "vitest";

import type { SourceMapping } from "@/domain/types";

import { EspnFantasySource } from "./espn-source";

const hasLiveConfiguration = [
  "ESPN_LEAGUE_ID",
  "ESPN_EARLIEST_SEASON",
  "ESPN_S2",
  "ESPN_SWID",
].every((name) => process.env[name]?.trim());

describe.skipIf(!hasLiveConfiguration)("ESPN live smoke test", () => {
  it("maps every configured completed season", async () => {
    const earliestSeason = Number(process.env.ESPN_EARLIEST_SEASON);
    const source = new EspnFantasySource({
      leagueId: Number(process.env.ESPN_LEAGUE_ID),
      earliestSeason,
      espnS2: process.env.ESPN_S2!,
      swid: process.env.ESPN_SWID!,
    });
    let knownMappings: SourceMapping[] = [];

    for (let year = earliestSeason; year <= 2025; year += 1) {
      const snapshot = await source.fetchSeason({
        year,
        knownMappings,
      });
      expect(snapshot.franchises).toHaveLength(snapshot.season.teamCount);
      expect(snapshot.matchups.length).toBeGreaterThan(0);
      expect(snapshot.scores.length).toBeGreaterThan(0);
      knownMappings = [
        ...knownMappings,
        ...snapshot.sourceMappings.filter(
          (mapping) =>
            !knownMappings.some(
              (known) =>
                known.provider === mapping.provider &&
                known.entityType === mapping.entityType &&
                known.externalId === mapping.externalId,
            ),
        ),
      ];
    }
  });
});
