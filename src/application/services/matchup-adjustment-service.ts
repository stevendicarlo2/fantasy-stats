import { randomUUID } from "node:crypto";

import { SafeOperationalError } from "@/application/errors";
import type { DatabaseProvider } from "@/application/ports/database-provider";
import { matchupOverrideSchema } from "@/domain/schemas";
import type {
  CanonicalId,
  MatchupOverride,
} from "@/domain/types";

export interface SaveMatchupAdjustmentInput {
  seasonYear: number;
  matchupId: CanonicalId;
  franchiseId: CanonicalId;
  scoreAdjustment: number;
  reason: string;
}

interface MatchupAdjustmentServiceOptions {
  database: Pick<
    DatabaseProvider,
    | "getSeasonImportSnapshot"
    | "listMatchupOverrides"
    | "saveMatchupOverride"
    | "deleteMatchupOverride"
  >;
  createId?: () => string;
  now?: () => Date;
}

export class MatchupAdjustmentService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(private readonly options: MatchupAdjustmentServiceOptions) {
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  async listSeasonAdjustments(
    seasonYear: number,
  ): Promise<MatchupOverride[] | null> {
    const snapshot =
      await this.options.database.getSeasonImportSnapshot(seasonYear);

    if (!snapshot) {
      return null;
    }

    return this.options.database.listMatchupOverrides(snapshot.season.id);
  }

  async saveAdjustment(
    input: SaveMatchupAdjustmentInput,
  ): Promise<MatchupOverride> {
    const snapshot =
      await this.options.database.getSeasonImportSnapshot(input.seasonYear);

    if (!snapshot) {
      throw new SafeOperationalError(
        `Season ${input.seasonYear} has not been imported`,
      );
    }

    const matchup = snapshot.matchups.find(
      (candidate) => candidate.id === input.matchupId,
    );

    if (
      !matchup ||
      (matchup.homeFranchiseId !== input.franchiseId &&
        matchup.awayFranchiseId !== input.franchiseId)
    ) {
      throw new SafeOperationalError(
        "The adjustment must target a franchise in the selected matchup",
      );
    }

    const hasImportedScore = snapshot.scores.some(
      (score) =>
        score.matchupId === input.matchupId &&
        score.franchiseId === input.franchiseId,
    );

    if (!hasImportedScore) {
      throw new SafeOperationalError(
        "The selected franchise does not have an imported matchup score",
      );
    }

    const existingOverrides =
      await this.options.database.listMatchupOverrides(snapshot.season.id);
    const existingOverride = existingOverrides.find(
      (matchupOverride) =>
        matchupOverride.matchupId === input.matchupId &&
        matchupOverride.franchiseId === input.franchiseId,
    );
    const matchupOverride = matchupOverrideSchema.parse({
      id: existingOverride?.id ?? this.createId(),
      matchupId: input.matchupId,
      franchiseId: input.franchiseId,
      scoreAdjustment: input.scoreAdjustment,
      reason: input.reason,
      createdAt:
        existingOverride?.createdAt ?? this.now().toISOString(),
    });

    return this.options.database.saveMatchupOverride(matchupOverride);
  }

  async deleteAdjustment(
    seasonYear: number,
    matchupOverrideId: CanonicalId,
  ): Promise<void> {
    const adjustments = await this.listSeasonAdjustments(seasonYear);

    if (!adjustments) {
      throw new SafeOperationalError(
        `Season ${seasonYear} has not been imported`,
      );
    }

    if (
      !adjustments.some(
        (matchupOverride) => matchupOverride.id === matchupOverrideId,
      )
    ) {
      throw new SafeOperationalError(
        "The selected matchup adjustment was not found",
      );
    }

    const deleted =
      await this.options.database.deleteMatchupOverride(matchupOverrideId);

    if (!deleted) {
      throw new SafeOperationalError(
        "The selected matchup adjustment could not be deleted",
      );
    }
  }
}
