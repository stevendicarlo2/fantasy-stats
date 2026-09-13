"use client";

import { type ReactNode, useState } from "react";

import type { MatchupRosterPlayer, MatchupRosterTeam } from "@/domain/types";

import {
  describeGameState,
  formatGameStatusLine,
  formatStatLine,
  summarizeTeamPlay,
  type MatchupComparisonRow,
  type MatchupComparisonRows,
} from "./matchup-presentation";

interface MatchupComparisonPanelProps {
  homeTeam: MatchupRosterTeam | undefined;
  awayTeam: MatchupRosterTeam | undefined;
  comparisonRows: MatchupComparisonRows;
  nowIso: string;
}

function formatPoints(value: number | null) {
  return value === null ? "--" : value.toFixed(2);
}

function teamLabel(team: MatchupRosterTeam | undefined) {
  if (!team) {
    return "";
  }
  return team.franchiseName ?? team.ownerName ?? "Unknown franchise";
}

function actualPlayerPoints(
  player: MatchupRosterPlayer | null,
  now: Date,
): number | null {
  if (!player) {
    return null;
  }

  const state = describeGameState(player.game, now);
  return state === "scheduled" || state === "bye"
    ? null
    : player.actualFantasyPoints;
}

function playerCell(player: MatchupRosterPlayer | null, now: Date) {
  if (!player) {
    return <span className="player-cell-empty">--</span>;
  }

  const state = describeGameState(player.game, now);
  const statusLine = formatGameStatusLine(player.game, state);
  const statLine = formatStatLine(
    player.position,
    player.game?.stats ?? null,
  );
  const isLive = state === "in_progress";

  return (
    <div className={`player-info${isLive ? " live" : " muted"}`}>
      <p className="player-name">
        {player.displayName}
        {player.nflTeamAbbreviation ? (
          <span className="player-team"> {player.nflTeamAbbreviation}</span>
        ) : null}
      </p>
      <p className="player-status">{statusLine}</p>
      {statLine ? <p className="player-stat-line">{statLine}</p> : null}
    </div>
  );
}

function columnGroup(showProjected: boolean) {
  if (showProjected) {
    return (
      <colgroup>
        <col style={{ width: "30%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "30%" }} />
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col style={{ width: "34%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "34%" }} />
    </colgroup>
  );
}

function scoreboardHead(
  homeTeam: MatchupRosterTeam | undefined,
  awayTeam: MatchupRosterTeam | undefined,
  now: Date,
  showProjected: boolean,
) {
  const fullSideSpan = showProjected ? 3 : 2;
  const outerSpan = showProjected ? 2 : 1;

  return (
    <thead>
      <tr className="matchup-team-names-row">
        <th colSpan={fullSideSpan} className="team-name-cell home">
          {teamLabel(homeTeam)}
        </th>
        <th className="position-cell" aria-hidden="true" />
        <th colSpan={fullSideSpan} className="team-name-cell away">
          {teamLabel(awayTeam)}
        </th>
      </tr>
      <tr className="matchup-scoreline-row">
        <th colSpan={outerSpan} className="team-summary-cell home">
          {teamSummaryText(homeTeam, now)}
        </th>
        <th className="team-score-cell home">
          <strong className="team-score">
            {formatPoints(homeTeam?.effectiveScore ?? null)}
          </strong>
        </th>
        <th className="position-cell" aria-hidden="true" />
        <th className="team-score-cell away">
          <strong className="team-score">
            {formatPoints(awayTeam?.effectiveScore ?? null)}
          </strong>
        </th>
        <th colSpan={outerSpan} className="team-summary-cell away">
          {teamSummaryText(awayTeam, now)}
        </th>
      </tr>
    </thead>
  );
}

function comparisonSection(
  title: string,
  rows: MatchupComparisonRow[],
  now: Date,
  showProjected: boolean,
  variant: "starters" | "reserve" = "starters",
  head: ReactNode = null,
) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      className={`roster-section${variant === "reserve" ? " reserve" : ""}`}
      aria-label={title}
      key={title}
    >
      <div className="table-wrap">
        <table
          className={`matchup-comparison-table${
            showProjected ? " with-projected" : ""
          }`}
        >
          {columnGroup(showProjected)}
          {head}
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.slotLabel}-${index}`}>
                <td className="player-cell home">
                  {playerCell(row.home, now)}
                </td>
                {showProjected ? (
                  <td className="projected-cell home">
                    {formatPoints(row.home?.projectedFantasyPoints ?? null)}
                  </td>
                ) : null}
                <td className="points-cell home">
                  {formatPoints(actualPlayerPoints(row.home, now))}
                </td>
                <td className="position-cell">{row.slotLabel}</td>
                <td className="points-cell away">
                  {formatPoints(actualPlayerPoints(row.away, now))}
                </td>
                {showProjected ? (
                  <td className="projected-cell away">
                    {formatPoints(row.away?.projectedFantasyPoints ?? null)}
                  </td>
                ) : null}
                <td className="player-cell away">
                  {playerCell(row.away, now)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function teamSummaryText(team: MatchupRosterTeam | undefined, now: Date) {
  if (!team) {
    return null;
  }

  const summary = summarizeTeamPlay(team.players, now);

  return (
    <span className="team-summary">
      In Play: {summary.inPlayCount} To Play: {summary.toPlayCount}{" "}
      Proj Total: {summary.projectedTotal.toFixed(1)}
    </span>
  );
}

export function MatchupComparisonPanel({
  homeTeam,
  awayTeam,
  comparisonRows,
  nowIso,
}: MatchupComparisonPanelProps) {
  const [showProjected, setShowProjected] = useState(false);
  const now = new Date(nowIso);
  const head = scoreboardHead(homeTeam, awayTeam, now, showProjected);

  const sections: Array<{
    title: string;
    rows: MatchupComparisonRow[];
    variant: "starters" | "reserve";
  }> = [
    { title: "Starters", rows: comparisonRows.starters, variant: "starters" },
    { title: "Bench", rows: comparisonRows.bench, variant: "reserve" },
    {
      title: "Injured reserve",
      rows: comparisonRows.injuredReserve,
      variant: "reserve",
    },
  ];
  const firstNonEmptyIndex = sections.findIndex(
    (section) => section.rows.length > 0,
  );

  return (
    <section className="panel matchup-comparison">
      <div className="points-toggle" aria-label="Points display">
        <button
          type="button"
          className={showProjected ? undefined : "selected"}
          onClick={() => setShowProjected(false)}
        >
          Actual
        </button>
        <button
          type="button"
          className={showProjected ? "selected" : undefined}
          onClick={() => setShowProjected(true)}
        >
          Show projected
        </button>
      </div>
      {sections.map((section, index) =>
        comparisonSection(
          section.title,
          section.rows,
          now,
          showProjected,
          section.variant,
          index === firstNonEmptyIndex ? head : null,
        ),
      )}
    </section>
  );
}
