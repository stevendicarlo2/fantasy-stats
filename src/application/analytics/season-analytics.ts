import type {
  AnalyticsMetricValues,
  SeasonAnalyticsRecord,
} from "@/application/services/season-stats-service";

export type AnalyticsMetric = "anp" | "np" | "score";
export type AnalyticsPerspective = "team" | "opponent";

export const analyticsMetrics: AnalyticsMetric[] = [
  "np",
  "anp",
  "score",
];

export interface AnalyticsFilters {
  selectedFranchiseIds: string[];
  startWeek: number;
  endWeek: number;
  metrics: AnalyticsMetric[];
  perspectives: AnalyticsPerspective[];
  tableMetric: AnalyticsMetric;
  tablePerspective: AnalyticsPerspective;
}

export interface AnalyticsFranchise {
  id: string;
  displayName: string;
  teamName: string;
}

export interface AnalyticsSummaryRow {
  franchiseId: string;
  displayName: string;
  teamName: string;
  rank: number;
  totals: {
    team: AnalyticsMetricValues;
    opponent: AnalyticsMetricValues;
  };
  weeks: Map<number, SeasonAnalyticsRecord>;
}

export interface AnalyticsChartSeries {
  key: string;
  franchiseId: string;
  displayName: string;
  metric: AnalyticsMetric;
  perspective: "team" | "opponent";
}

export interface AnalyticsChartPoint {
  week: number;
  [seriesKey: string]: number;
}

function emptyMetricValues(): AnalyticsMetricValues {
  return { score: 0, np: 0, anp: 0 };
}

export function listAnalyticsFranchises(
  records: SeasonAnalyticsRecord[],
): AnalyticsFranchise[] {
  const franchises = new Map<
    string,
    { displayName: string; teamName: string }
  >();

  for (const record of records) {
    franchises.set(record.franchiseId, {
      displayName: record.displayName,
      teamName: record.teamName,
    });
  }

  return [...franchises.entries()]
    .map(([id, names]) => ({ id, ...names }))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
}

export function createDefaultAnalyticsFilters(
  records: SeasonAnalyticsRecord[],
  startWeek: number,
  endWeek: number,
): AnalyticsFilters {
  return {
    selectedFranchiseIds: listAnalyticsFranchises(records).map(
      (franchise) => franchise.id,
    ),
    startWeek,
    endWeek,
    metrics: ["anp"],
    perspectives: ["team"],
    tableMetric: "anp",
    tablePerspective: "team",
  };
}

export function filterAnalyticsRecords(
  records: SeasonAnalyticsRecord[],
  filters: AnalyticsFilters,
) {
  const selectedFranchiseIds = new Set(
    filters.selectedFranchiseIds,
  );

  return records.filter(
    (record) =>
      selectedFranchiseIds.has(record.franchiseId) &&
      record.week >= filters.startWeek &&
      record.week <= filters.endWeek,
  );
}

function addMetricValues(
  total: AnalyticsMetricValues,
  values: AnalyticsMetricValues,
) {
  total.score += values.score;
  total.np += values.np;
  total.anp += values.anp;
}

function rankingValue(
  row: Omit<AnalyticsSummaryRow, "rank">,
  filters: AnalyticsFilters,
) {
  return row.totals[filters.tablePerspective][filters.tableMetric];
}

export function summarizeAnalytics(
  records: SeasonAnalyticsRecord[],
  filters: AnalyticsFilters,
): AnalyticsSummaryRow[] {
  const selectedRecords = filterAnalyticsRecords(records, filters);
  const franchiseNames = new Map(
    listAnalyticsFranchises(records).map((franchise) => [
      franchise.id,
      franchise,
    ]),
  );
  const rows = filters.selectedFranchiseIds.map((franchiseId) => ({
    franchiseId,
    displayName:
      franchiseNames.get(franchiseId)?.displayName ?? "Unknown person",
    teamName:
      franchiseNames.get(franchiseId)?.teamName ?? "Unknown team",
    totals: {
      team: emptyMetricValues(),
      opponent: emptyMetricValues(),
    },
    weeks: new Map<number, SeasonAnalyticsRecord>(),
  }));
  const rowsByFranchiseId = new Map(
    rows.map((row) => [row.franchiseId, row]),
  );

  for (const record of selectedRecords) {
    const row = rowsByFranchiseId.get(record.franchiseId);

    if (!row) {
      continue;
    }

    addMetricValues(row.totals.team, record.team);
    addMetricValues(row.totals.opponent, record.opponent);
    row.weeks.set(record.week, record);
  }

  const sortedRows = rows.sort((left, right) => {
    const difference =
      rankingValue(right, filters) - rankingValue(left, filters);

    return (
      difference ||
      left.displayName.localeCompare(right.displayName)
    );
  });
  let previousValue: number | undefined;
  let previousRank = 0;

  return sortedRows.map((row, index) => {
    const value = rankingValue(row, filters);
    const rank =
      previousValue === value ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;

    return { ...row, rank };
  });
}

export function buildAnalyticsChart(
  records: SeasonAnalyticsRecord[],
  filters: AnalyticsFilters,
): {
  points: AnalyticsChartPoint[];
  series: AnalyticsChartSeries[];
} {
  const allFranchises = listAnalyticsFranchises(records);
  const franchises = new Map(
    allFranchises.map((franchise) => [
      franchise.id,
      franchise,
    ]),
  );
  const series: AnalyticsChartSeries[] = [];

  for (const franchiseId of filters.selectedFranchiseIds) {
    const franchise = franchises.get(franchiseId);

    if (!franchise) {
      continue;
    }

    for (const metric of filters.metrics) {
      for (const perspective of filters.perspectives) {
        const key = [
          franchiseId,
          metric,
          perspective,
        ].join("__");
        series.push({
          key,
          franchiseId,
          displayName: franchise.displayName,
          metric,
          perspective,
        });
      }

    }
  }

  const recordsByFranchiseWeek = new Map(
    records.map((record) => [
      `${record.franchiseId}:${record.week}`,
      record,
    ]),
  );
  const points = Array.from(
    { length: filters.endWeek - filters.startWeek + 1 },
    (_, index) => {
      const week = filters.startWeek + index;
      const point: AnalyticsChartPoint = { week };

      for (const item of series) {
        const record = recordsByFranchiseWeek.get(
          `${item.franchiseId}:${week}`,
        );

        if (record) {
          point[item.key] =
            record[item.perspective][item.metric];
        }
      }

      return point;
    },
  );

  return { points, series };
}

export type AnalyticsSortKey =
  | "rank"
  | "person"
  | "team"
  | `total:${AnalyticsPerspective}:${AnalyticsMetric}`
  | `week:${number}`;

export type AnalyticsSortDirection = "asc" | "desc";

function compareNumbers(
  left: number | undefined,
  right: number | undefined,
) {
  if (left === undefined) {
    return right === undefined ? 0 : 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left - right;
}

export function sortAnalyticsSummary(
  rows: AnalyticsSummaryRow[],
  sortKey: AnalyticsSortKey,
  direction: AnalyticsSortDirection,
  weeklyMetric: AnalyticsMetric,
  weeklyPerspective: AnalyticsPerspective,
) {
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    let comparison: number;

    if (sortKey === "person") {
      comparison = left.displayName.localeCompare(right.displayName);
    } else if (sortKey === "team") {
      comparison = left.teamName.localeCompare(right.teamName);
    } else if (sortKey === "rank") {
      comparison = left.rank - right.rank;
    } else if (sortKey.startsWith("total:")) {
      const [, perspective, metric] = sortKey.split(":") as [
        "total",
        AnalyticsPerspective,
        AnalyticsMetric,
      ];
      comparison =
        left.totals[perspective][metric] -
        right.totals[perspective][metric];
    } else {
      const week = Number(sortKey.slice("week:".length));
      const leftValue =
        left.weeks.get(week)?.[weeklyPerspective][weeklyMetric];
      const rightValue =
        right.weeks.get(week)?.[weeklyPerspective][weeklyMetric];

      if (leftValue === undefined || rightValue === undefined) {
        return (
          compareNumbers(leftValue, rightValue) ||
          left.displayName.localeCompare(right.displayName)
        );
      }

      comparison = leftValue - rightValue;
    }

    return (
      comparison * multiplier ||
      left.displayName.localeCompare(right.displayName)
    );
  });
}

export interface AnalyticsValueRange {
  minimum: number;
  maximum: number;
}

export function findAnalyticsValueRange(
  values: number[],
): AnalyticsValueRange | null {
  if (values.length === 0) {
    return null;
  }

  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}
