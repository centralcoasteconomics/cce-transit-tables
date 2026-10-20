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

**Flapping feeds (2026-10-19).** A feed that fails some nights and recovers on its own keeps
its county's previous table (held, never published partial) but no longer turns the run red,
when it has 7+ nights of history, has not failed 3 nights in a row, and failed at most half of
the last 14 nights (`flap.mjs`; per-feed results in `state/feed-history.json`). The rule
starts counting from the first nightly after deploy, so it takes effect after about a week.
`npm test` runs its checks.
