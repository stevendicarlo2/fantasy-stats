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
> &
  Partial<
    Pick<
      SeasonImportService,
      "executeStartedRun" | "prepareOperation" | "provider"
    >
  >;
type SupplementalService = Pick<
  SupplementalImportService,
  "importRosters" | "importTransactions" | "importPlayerStats"
> &
  Partial<
    Pick<
      SupplementalImportService,
      "executeStartedRun" | "prepareDataset" | "providerForDataset"
    >
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

  providerForDataset(dataset: ImportDataset) {
    const provider =
      dataset === "core"
        ? this.core.provider
        : this.supplemental.providerForDataset?.(dataset);

    if (!provider) {
      throw new Error("Dataset import provider is unavailable");
    }

    return provider;
  }

  async prepareDataset(
    year: number,
    dataset: ImportDataset,
    operation: ImportOperation,
  ) {
    if (dataset === "core") {
      if (!this.core.prepareOperation) {
        throw new Error("Core import preparation is unavailable");
      }
      await this.core.prepareOperation(operation, year);
      return;
    }

    if (!this.supplemental.prepareDataset) {
      throw new Error("Supplemental import preparation is unavailable");
    }
    await this.supplemental.prepareDataset(year);
  }

  executeStartedRun(run: ImportRun) {
    const execute =
      run.dataset === "core"
        ? this.core.executeStartedRun
        : this.supplemental.executeStartedRun;

    if (!execute) {
      throw new Error("Dataset import execution is unavailable");
    }

    return execute.call(
      run.dataset === "core" ? this.core : this.supplemental,
      run,
    );
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
