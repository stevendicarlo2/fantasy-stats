"use client";

import { useEffect, useState } from "react";

interface RelativeTimeProps {
  initialNow: number;
  value: string;
}

export function formatRelative(value: string, now: number) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (elapsed < 60_000) {
    return formatter.format(-Math.round(elapsed / 1_000), "second");
  }
  if (elapsed < 60 * 60_000) {
    return formatter.format(-Math.round(elapsed / 60_000), "minute");
  }
  if (elapsed < 24 * 60 * 60_000) {
    return formatter.format(
      -Math.round(elapsed / (60 * 60_000)),
      "hour",
    );
  }
  return formatter.format(
    -Math.round(elapsed / (24 * 60 * 60_000)),
    "day",
  );
}

export function RelativeTime({ initialNow, value }: RelativeTimeProps) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <time
      dateTime={value}
      suppressHydrationWarning
      title={new Date(value).toLocaleString()}
    >
      {formatRelative(value, now)}
    </time>
  );
}
