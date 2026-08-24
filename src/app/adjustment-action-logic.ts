import { z } from "zod";

import { SafeOperationalError } from "@/application/errors";
import type { MatchupAdjustmentService } from "@/application/services/matchup-adjustment-service";

export interface AdjustmentActionState {
  status: "idle" | "success" | "error";
  message: string;
  seasonYear: number | null;
}

export const initialAdjustmentActionState: AdjustmentActionState = {
  status: "idle",
  message: "",
  seasonYear: null,
};

type AdjustmentService = Pick<
  MatchupAdjustmentService,
  "saveAdjustment" | "deleteAdjustment"
>;

const seasonYearSchema = z.coerce.number().int().min(1900).max(2100);
const uuidSchema = z.uuid();
const scoreAdjustmentSchema = z.coerce.number().multipleOf(0.01);
const reasonSchema = z.string().trim().min(1).max(500);

function requireString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string") {
    throw new SafeOperationalError(`Missing ${name}`);
  }

  return value;
}

function parseSeasonYear(formData: FormData) {
  const result = seasonYearSchema.safeParse(
    requireString(formData, "seasonYear"),
  );

  if (!result.success) {
    throw new SafeOperationalError("Choose a valid season year");
  }

  return result.data;
}

function parseUuid(value: string, message: string) {
  const result = uuidSchema.safeParse(value);

  if (!result.success) {
    throw new SafeOperationalError(message);
  }

  return result.data;
}

export async function executeAdjustmentAction(
  formData: FormData,
  getService: () => AdjustmentService | Promise<AdjustmentService>,
): Promise<AdjustmentActionState> {
  let seasonYear: number | null = null;

  try {
    seasonYear = parseSeasonYear(formData);
    const operation = requireString(formData, "operation");

    if (operation === "delete") {
      const matchupOverrideId = parseUuid(
        requireString(formData, "matchupOverrideId"),
        "Choose a valid matchup adjustment",
      );
      const service = await getService();
      await service.deleteAdjustment(seasonYear, matchupOverrideId);

      return {
        status: "success",
        message: "Matchup adjustment deleted",
        seasonYear,
      };
    }

    if (operation !== "save") {
      throw new SafeOperationalError("Choose a valid adjustment operation");
    }

    const target = requireString(formData, "target").split(":");

    if (target.length !== 2) {
      throw new SafeOperationalError("Choose a valid matchup score");
    }

    const matchupId = parseUuid(target[0], "Choose a valid matchup score");
    const franchiseId = parseUuid(target[1], "Choose a valid matchup score");
    const scoreAdjustmentValue = requireString(
      formData,
      "scoreAdjustment",
    );
    const scoreAdjustmentResult =
      scoreAdjustmentValue.trim().length === 0
        ? { success: false as const }
        : scoreAdjustmentSchema.safeParse(scoreAdjustmentValue);
    const reasonResult = reasonSchema.safeParse(
      requireString(formData, "reason"),
    );

    if (!scoreAdjustmentResult.success) {
      throw new SafeOperationalError(
        "Enter an adjustment with at most two decimal places",
      );
    }

    if (!reasonResult.success) {
      throw new SafeOperationalError(
        "Enter a reason between 1 and 500 characters",
      );
    }

    const service = await getService();
    await service.saveAdjustment({
      seasonYear,
      matchupId,
      franchiseId,
      scoreAdjustment: scoreAdjustmentResult.data,
      reason: reasonResult.data,
    });

    return {
      status: "success",
      message: "Matchup adjustment saved",
      seasonYear,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The matchup adjustment failed unexpectedly",
      seasonYear,
    };
  }
}
