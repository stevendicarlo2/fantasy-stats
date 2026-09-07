/**
 * Builds season-scoped, consecutive-scoring-period ranges from weekly
 * observations of some value (an NFL team ID or a canonical position) for one
 * player. A new range starts whenever the observed value changes or whenever
 * there is a gap between observed scoring periods; continuity is never
 * inferred across an unobserved week. Input order does not matter; output
 * ranges are sorted by start scoring period.
 */
export interface ScoringPeriodObservation<TValue> {
  scoringPeriod: number;
  value: TValue;
}

export interface ObservationRange<TValue> {
  value: TValue;
  startScoringPeriod: number;
  endScoringPeriod: number;
}

export function buildObservationRanges<TValue>(
  observations: ScoringPeriodObservation<TValue>[],
): ObservationRange<TValue>[] {
  const sorted = [...observations].sort(
    (left, right) => left.scoringPeriod - right.scoringPeriod,
  );
  const ranges: ObservationRange<TValue>[] = [];

  for (const observation of sorted) {
    const current = ranges.at(-1);
    const isContiguousSameValue =
      current !== undefined &&
      current.value === observation.value &&
      observation.scoringPeriod === current.endScoringPeriod + 1;

    if (isContiguousSameValue && current) {
      current.endScoringPeriod = observation.scoringPeriod;
    } else {
      ranges.push({
        value: observation.value,
        startScoringPeriod: observation.scoringPeriod,
        endScoringPeriod: observation.scoringPeriod,
      });
    }
  }

  return ranges;
}
