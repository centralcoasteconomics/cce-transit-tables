# cce-transit-tables
Nightly GTFS preprocessing for Site Due Diligence (Central Coast Economics).
Downloads the public county GTFS feeds, computes per-stop AM (7–9a) / PM (4–6p) peak
departure counts on a representative weekday, and publishes compact JSON tables the
cloud engine consumes (`tables/<county>.json`). Parity source: the desktop engine's
`transit/gtfs.ts` — the headway math (120min ÷ departures; ≤30-min frequency test)
is applied downstream from these counts, identically in both engines.
Runs nightly via GitHub Actions; run locally with `npm ci && node preprocess.mjs`.
Data: publicly published GTFS from the agencies listed in `transitFeeds.json` (94 feeds
across 51 California counties as of 2026-09-15; the file is synced from the app's
`src/shared/transitFeeds.json` and carries the reasons for the 7 counties left unwired).
