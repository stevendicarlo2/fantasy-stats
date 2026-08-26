# Season Analytics

Each imported season page includes an interactive regular-season analytics
dashboard that replaces the static standings table.

## Data loading

The server loads and validates the complete regular-season analytics dataset
for the selected season. Each record contains one franchise's weekly:

- Effective fantasy score
- NASCAR Points (NP)
- Adjusted NASCAR Points (ANP)
- Opponent score, NP, and ANP

The dataset is sent to the season-page client component once. Team, week,
metric, perspective, total, rank, table, and chart changes are then calculated
in the browser without additional database requests.

Playoff and consolation weeks are excluded. Manual score adjustments are
already included through the effective-score SQL views.

## Filters

Available filters are:

- People, including Select All and Clear controls
- Inclusive regular-season range using a dual-handle slider
- One or more metrics: NP, ANP, and fantasy score
- Independently toggled team and opponent perspectives
- One metric and perspective combination for weekly table cells

Filters are intentionally temporary. They are held only in client component
state and reset when the page reloads, the season changes, or navigation leaves
the page.

Clicking or beginning a drag anywhere on the week track moves the nearest
handle, so selecting a new bound does not require first grabbing its knob.

## Standings and weekly breakdown

One table provides both standings and weekly detail. Its mode toggle chooses
between:

- Default standings, which always show every person, the complete regular
  season, team NP and ANP totals, and weekly team ANP.
- Filtered values, which apply the people and week filters, show totals for
  every selected metric and perspective, and use the weekly-value selector for
  week cells and standings order.

Every column is sortable. Total and weekly values are color-scaled from lower
to higher values. Heat-scale bounds always use every franchise for the same
week range, so hiding rows does not change the meaning of existing colors.
Person, team, and visible total columns remain frozen during horizontal
scrolling. Default standings show a cutoff rule after the season's configured
number of ESPN playoff teams; filtered standings and alternate sorts omit it.

Rows represent canonical franchises using curated person display names and
the ESPN team name stored for the selected season.
Whole numbers are displayed without trailing decimal zeroes.

## Chart

The weekly line chart uses the same filtered records as the table:

- Each person, metric, and perspective creates a separate series.
- Each person has one stable, deterministic color.
- NP is solid, ANP is dashed, and fantasy score is dotted.
- Opponent series use the same person color and metric pattern at lower
  opacity.
- The custom legend names and previews each series' metric and perspective.
- Straight line segments are used instead of smoothed curves.
- Tooltip entries are sorted from the highest visible value to the lowest.
- NP and ANP use the points axis.
- Fantasy scores use a separate score axis.

Because the table and chart share pure filtering and series-generation
functions, their visible data should remain consistent.

The application analytics module returns semantic rows, ranks, ranges, and
chart-series identities. React components own interaction and rendering, while
the season-page presentation module owns colors, heat values, dash patterns,
opacity, labels, and number formatting.
