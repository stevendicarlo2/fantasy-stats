import type { SeasonAnalyticsRecord } from "@/application/services/season-stats-service";

export function createAnalyticsTestRecords(
  franchiseCount = 7,
  weekCount = 2,
): SeasonAnalyticsRecord[] {
  return Array.from({ length: franchiseCount }, (_, franchiseIndex) =>
    Array.from({ length: weekCount }, (_, weekIndex) => {
      const week = weekIndex + 1;
      const score = 100 + franchiseIndex * 10 + week;
      const opponentIndex =
        (franchiseIndex + 1) % franchiseCount;

      return {
        franchiseId: `franchise-${franchiseIndex}`,
        displayName: `Person ${franchiseIndex}`,
        teamName: `Team ${franchiseIndex}`,
        opponentFranchiseId: `franchise-${opponentIndex}`,
        opponentDisplayName: `Person ${opponentIndex}`,
        opponentTeamName: `Team ${opponentIndex}`,
        week,
        team: {
          score,
          np: franchiseIndex + week,
          anp: franchiseIndex * 2 + week,
        },
        opponent: {
          score: score - 5,
          np: opponentIndex + week,
          anp: opponentIndex * 2 + week,
        },
      };
    }),
  ).flat();
}
