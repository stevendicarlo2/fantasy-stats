"use client";

import { useRouter } from "next/navigation";

interface SeasonYearSelectorProps {
  availableYears: number[];
  currentYear: number;
}

export function SeasonYearSelector({
  availableYears,
  currentYear,
}: SeasonYearSelectorProps) {
  const router = useRouter();

  return (
    <label className="season-year-selector">
      <span>Season</span>
      <select
        aria-label="Season"
        value={currentYear}
        onChange={(event) => {
          router.push(`/seasons/${event.target.value}`);
        }}
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}
