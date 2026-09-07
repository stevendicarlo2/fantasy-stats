import type {
  PlayerStatsImportSnapshot,
  RelevantPlayer,
  SourceMapping,
} from "@/domain/types";

export interface FetchPlayerStatsInput {
  year: number;
  scoringPeriods: number[];
  relevantPlayers: RelevantPlayer[];
  knownMappings: SourceMapping[];
}

export interface NflSource {
  readonly provider: string;
  fetchPlayerStats(
    input: FetchPlayerStatsInput,
  ): Promise<PlayerStatsImportSnapshot>;
}
