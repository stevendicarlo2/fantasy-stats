"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  DataSyncView,
  DataSyncViewState,
} from "@/application/services/data-sync-coordinator";

import { pollDataSyncView } from "./actions";

interface DataSyncIndicatorProps {
  initialState: DataSyncViewState;
  seasonYear: number;
  view: DataSyncView;
}

export function DataSyncIndicator({
  initialState,
  seasonYear,
  view,
}: DataSyncIndicatorProps) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const revision = useRef(initialState.revision);

  useEffect(() => {
    if (state.pollAfterMs === null) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const next = await pollDataSyncView(seasonYear, view);
        const changed = next.revision !== revision.current;
        revision.current = next.revision;
        setState(next);

        if (changed) {
          router.refresh();
        }
      } catch (error) {
        console.error("Failed to poll data synchronization status", error);
        setState((current) => ({ ...current, pollAfterMs: 2_000 }));
      }
    }, state.pollAfterMs);

    return () => window.clearTimeout(timeout);
  }, [router, seasonYear, state, view]);

  return state.isSyncing ? (
    <p className="data-sync-indicator" role="status">
      <span aria-hidden="true" className="data-sync-spinner" />
      Syncing latest data...
    </p>
  ) : null;
}
