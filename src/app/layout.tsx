import type { Metadata } from "next";
import type { ReactNode } from "react";

import { FeatureFlagsProvider } from "@/feature-flags/feature-flags-provider";
import { getFeatureFlags } from "@/server/config/feature-flags";

import "./globals.css";

export const metadata: Metadata = {
  title: "Fantasy Stats",
  description: "Historical fantasy football analysis and scoring",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const featureFlags = getFeatureFlags();

  return (
    <html lang="en">
      <body>
        <FeatureFlagsProvider flags={featureFlags}>
          {children}
        </FeatureFlagsProvider>
      </body>
    </html>
  );
}
