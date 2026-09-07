import type { ImportOperation, ImportRun } from "@/domain/types";

import type { SeasonImportService } from "./season-import-service";
import type { SupplementalImportService } from "./supplemental-import-service";

export interface SeasonDataImportResult {
  core: ImportRun;
  rosters: PromiseSettledResult<ImportRun>;
  transactions: PromiseSettledResult<ImportRun>;
  playerStats: PromiseSettledResult<ImportRun>;
}

type CoreImportService = Pick<
  SeasonImportService,
  "importSeason" | "refreshSeason"
>;
type SupplementalService = Pick<
  SupplementalImportService,
  "importRosters" | "importTransactions" | "importPlayerStats"
>;

export class SeasonDataImportService {
  constructor(
    private readonly core: CoreImportService,
    private readonly supplemental: SupplementalService,
  ) {}

  importSeason(year: number) {
    return this.execute("import", year);
  }

  refreshSeason(year: number) {
    return this.execute("refresh", year);
  }

  retryRosters(year: number) {
    return this.supplemental.importRosters(year);
  }

  retryTransactions(year: number) {
    return this.supplemental.importTransactions(year);
  }

  retryPlayerStats(year: number) {
    return this.supplemental.importPlayerStats(year);
  }

  private async execute(
    operation: ImportOperation,
    year: number,
  ): Promise<SeasonDataImportResult> {
    const core =
      operation === "import"
        ? await this.core.importSeason(year)
        : await this.core.refreshSeason(year);
    const rosters = await settle(
      this.supplemental.importRosters(year, operation),
    );
    const transactions = await settle(
      this.supplemental.importTransactions(year, operation),
    );
    const playerStats = await settle(
      this.supplemental.importPlayerStats(year, operation),
    );

    return {
      core,
      rosters,
      transactions,
      playerStats,
    };
  }
}

async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await promise };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}
