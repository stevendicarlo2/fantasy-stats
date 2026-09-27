"use client";

import { useEffect, useState } from "react";

interface RelativeTimeProps {
  value: string;
}

function formatRelative(value: string, now: number) {
  const difference = new Date(value).getTime() - now;
  const absolute = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (absolute < 60_000) {
    return formatter.format(Math.round(difference / 1_000), "second");
  }
  if (absolute < 60 * 60_000) {
    return formatter.format(Math.round(difference / 60_000), "minute");
  }
  if (absolute < 24 * 60 * 60_000) {
    return formatter.format(
      Math.round(difference / (60 * 60_000)),
      "hour",
    );
  }
  return formatter.format(
    Math.round(difference / (24 * 60 * 60_000)),
    "day",
  );
}

export function RelativeTime({ value }: RelativeTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <time dateTime={value} title={new Date(value).toLocaleString()}>
      {formatRelative(value, now)}
    </time>
  );
}
