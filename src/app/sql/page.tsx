import Link from "next/link";
import { connection } from "next/server";

import { SafeOperationalError } from "@/application/errors";
import { getWebRuntime } from "@/server/runtime/web-runtime";

import { SqlConsole } from "./sql-console";

async function loadSqlConsole() {
  try {
    await getWebRuntime();
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof SafeOperationalError
          ? error.message
          : "The SQL console could not initialize its server runtime.",
    };
  }
}

export default async function SqlConsolePage() {
  await connection();
  const pageData = await loadSqlConsole();

  if (!pageData.ok) {
    return (
      <main className="shell">
        <Link className="back-link" href="/">
          &larr; Season imports
        </Link>
        <section className="hero">
          <p className="eyebrow">Fantasy Stats</p>
          <h1>SQL console unavailable</h1>
          <p className="summary">{pageData.message}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <Link className="back-link" href="/">
        &larr; Season imports
      </Link>
      <header className="hero compact season-hero">
        <div>
          <p className="eyebrow">Advanced exploration</p>
          <h1>SQL console</h1>
          <p className="summary">
            Query imported history and derived scoring without exposing a
            mutation path.
          </p>
        </div>
      </header>
      <SqlConsole />
    </main>
  );
}
