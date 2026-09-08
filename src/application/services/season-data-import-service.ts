import type { ImportOperation, ImportRun } from "@/domain/types";
import type { ImportDataset } from "@/domain/types";

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
  "importSeason" | "refreshSeason" | "syncSeason"
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

  async syncSeason(year: number) {
    const core = await this.core.syncSeason(year);
    return this.importSupplemental(core, year, core.operation);
  }

  syncDataset(
    year: number,
    dataset: ImportDataset,
    operation: ImportOperation,
  ): Promise<ImportRun> {
    if (dataset === "core") {
      return operation === "import"
        ? this.core.importSeason(year)
        : this.core.refreshSeason(year);
    }

    if (dataset === "rosters") {
      return this.supplemental.importRosters(year, operation);
    }

    if (dataset === "transactions") {
      return this.supplemental.importTransactions(year, operation);
    }

    return this.supplemental.importPlayerStats(year, operation);
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

    return this.importSupplemental(core, year, operation);
  }

  private async importSupplemental(
    core: ImportRun,
    year: number,
    operation: ImportOperation,
  ): Promise<SeasonDataImportResult> {
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
