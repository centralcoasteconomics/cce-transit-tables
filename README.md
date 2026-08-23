# cce-transit-tables
Nightly GTFS preprocessing for Site Due Diligence (Central Coast Economics).
Downloads the public county GTFS feeds, computes per-stop AM (7–9a) / PM (4–6p) peak
departure counts on a representative weekday, and publishes compact JSON tables the
cloud engine consumes (`tables/<county>.json`). Parity source: the desktop engine's
`transit/gtfs.ts` — the headway math (120min ÷ departures; ≤30-min frequency test)
is applied downstream from these counts, identically in both engines.
Runs nightly via GitHub Actions; run locally with `npm ci && node preprocess.mjs`.
Data: publicly published GTFS from VCTC, LA Metro, Foothill, LADOT, Big Blue Bus,
SBMTD, SLO RTA, SLO Transit.
