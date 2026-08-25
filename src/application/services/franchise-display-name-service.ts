import type { DatabaseProvider } from "@/application/ports/database-provider";
import { franchiseDisplayNameSchema } from "@/domain/schemas";
import type {
  CanonicalId,
  FranchiseDisplayName,
} from "@/domain/types";

type FranchiseDisplayNameDatabase = Pick<
  DatabaseProvider,
  "listFranchiseDisplayNames" | "saveFranchiseDisplayName"
>;

export class FranchiseDisplayNameService {
  constructor(private readonly database: FranchiseDisplayNameDatabase) {}

  listDisplayNames(): Promise<FranchiseDisplayName[]> {
    return this.database.listFranchiseDisplayNames();
  }

  async setDisplayName(
    franchiseId: CanonicalId,
    displayName: string,
  ): Promise<FranchiseDisplayName> {
    return this.database.saveFranchiseDisplayName(
      franchiseDisplayNameSchema.parse({
        franchiseId,
        displayName,
      }),
    );
  }
}
