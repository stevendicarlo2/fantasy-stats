"use client";

import {
  createContext,
  type ReactNode,
  useContext,
} from "react";

import type { FeatureFlags } from "./definitions";

const FeatureFlagsContext = createContext<FeatureFlags | null>(null);

export function FeatureFlagsProvider({
  children,
  flags,
}: {
  children: ReactNode;
  flags: FeatureFlags;
}) {
  return (
    <FeatureFlagsContext.Provider value={flags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  const flags = useContext(FeatureFlagsContext);

  if (!flags) {
    throw new Error(
      "useFeatureFlags must be used within FeatureFlagsProvider",
    );
  }

  return flags;
}
