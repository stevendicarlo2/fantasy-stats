import type {
  DatasetSourceResult,
  RosterImportSnapshot,
  SeasonImportSnapshot,
  SourceMapping,
  TransactionImportSnapshot,
} from "@/domain/types";

export interface FetchSeasonInput {
  year: number;
  knownMappings: SourceMapping[];
}

export interface FantasySource {
  readonly provider: string;
  fetchSeason(input: FetchSeasonInput): Promise<SeasonImportSnapshot>;
}

export interface FantasyRosterSource {
  readonly provider: string;
  fetchRosters(
    input: FetchSeasonInput,
  ): Promise<DatasetSourceResult<RosterImportSnapshot>>;
}

export interface FantasyTransactionSource {
  readonly provider: string;
  fetchTransactions(
    input: FetchSeasonInput,
  ): Promise<DatasetSourceResult<TransactionImportSnapshot>>;
}
