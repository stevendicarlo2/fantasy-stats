import { SafeOperationalError } from "@/application/errors";
import type { LineupSlot, PlayerPosition } from "@/domain/types";

/**
 * ESPN lineup slot IDs (`lineupSlotId`) identify where a roster entry sits,
 * including bench and injured reserve. These are distinct from `defaultPositionId`.
 */
const LINEUP_SLOT_BY_ESPN_ID: Record<number, LineupSlot> = {
  0: "QB",
  2: "RB",
  4: "WR",
  6: "TE",
  7: "OP",
  16: "DST",
  17: "K",
  20: "BE",
  21: "IR",
  23: "FLEX",
};

/**
 * ESPN's canonical player positions (`defaultPositionId`). Flexible lineup
 * eligibility slots (FLEX, OP, bench, IR, ...) are never canonical positions.
 */
const POSITION_BY_ESPN_DEFAULT_ID: Record<number, PlayerPosition> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

export const ESPN_DST_DEFAULT_POSITION_ID = 16;

export class EspnUnknownLineupSlotError extends SafeOperationalError {
  constructor(lineupSlotId: number) {
    super(`ESPN roster entry has an unrecognized lineup slot ${lineupSlotId}`);
    this.name = "EspnUnknownLineupSlotError";
  }
}

export function resolveEspnLineupSlot(lineupSlotId: number): LineupSlot {
  const slot = LINEUP_SLOT_BY_ESPN_ID[lineupSlotId];

  if (!slot) {
    throw new EspnUnknownLineupSlotError(lineupSlotId);
  }

  return slot;
}

/**
 * Returns `null` for any `defaultPositionId` outside the six canonical
 * fantasy positions rather than throwing, since roster import must not fail
 * for an unmodeled position; the roster entry itself is still imported, it
 * simply contributes no position-history observation for that week.
 */
export function resolveEspnCanonicalPosition(
  defaultPositionId: number,
): PlayerPosition | null {
  return POSITION_BY_ESPN_DEFAULT_ID[defaultPositionId] ?? null;
}

export function isEspnTeamDefense(defaultPositionId: number): boolean {
  return defaultPositionId === ESPN_DST_DEFAULT_POSITION_ID;
}
