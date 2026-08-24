import type { SeasonImportSnapshot, SourceMapping } from "@/domain/types";

export interface FetchSeasonInput {
  year: number;
  knownMappings: SourceMapping[];
}

export interface FantasySource {
  readonly provider: string;
  fetchSeason(input: FetchSeasonInput): Promise<SeasonImportSnapshot>;
}
