/**
 * FLAPPING: a third state between green and red for a feed that fails some nights and
 * recovers on its own (2026-10-19).
 *
 * Between 10/13 and 10/18, 3 of 6 nights went red, each on a different operator, each with
 * a green night on either side and the full stop count when it succeeded (rta, mst, fax).
 * The retry inside a run does not help, because the refusal lasts the whole run. The
 * expected-outage register does not fit either, because it is for diagnosed outages, and a
 * feed failing one night in two has nothing to diagnose. A run that is red half the time
 * stops being read.
 *
 * The rule: a failed feed counts as FLAPPING, which keeps the run green, only when ALL of
 * these hold:
 *   - the history covers at least MIN_NIGHTS nights for the feed (a new feed earns nothing);
 *   - it succeeded on at least one of the last MAX_CONSECUTIVE nights, so tonight's failure
 *     is not the third in a row (three in a row is an outage, and a human must look);
 *   - its failure rate over the last WINDOW nights, tonight included, is at most MAX_RATE;
 *   - the previous table is intact (the caller checks this, since only it reads the table).
 * A flapping feed NEVER publishes anything and NEVER lifts a hold. The county's table stays
 * exactly as it was last night. Flapping only decides the exit code, like the register.
 */
export const WINDOW = 14
export const MIN_NIGHTS = 7
export const MAX_CONSECUTIVE = 2
export const MAX_RATE = 0.5

/** History shape: { "<county>/<feedId>": { "YYYYMMDD": true|false, ... } }, true = succeeded. */
export function recordNight(history, key, today, ok) {
  const nights = { ...(history[key] ?? {}), [today]: ok }
  // Keep a little more than the window, so the file stays small.
  const keep = Object.keys(nights).sort().slice(-(WINDOW + 7))
  history[key] = Object.fromEntries(keep.map((d) => [d, nights[d]]))
  return history
}

/**
 * Whether tonight's failure of this feed is a flap. `history` must already hold tonight's
 * night (recordNight first). Returns { flapping, rate, failed, nights, reason }.
 */
export function flapStatus(history, key, today) {
  const all = Object.entries(history[key] ?? {})
    .filter(([d]) => d <= today)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  const recent = all.slice(-WINDOW)
  const failed = recent.filter(([, ok]) => !ok).length
  const rate = recent.length ? failed / recent.length : 1
  const base = { rate, failed, nights: recent.length }
  if (all.at(-1)?.[0] !== today || all.at(-1)?.[1] !== false) return { ...base, flapping: false, reason: 'did not fail tonight' }
  if (recent.length < MIN_NIGHTS) return { ...base, flapping: false, reason: `only ${recent.length} night(s) of history, ${MIN_NIGHTS} needed` }
  const lastFew = recent.slice(-(MAX_CONSECUTIVE + 1))
  if (lastFew.length === MAX_CONSECUTIVE + 1 && lastFew.every(([, ok]) => !ok)) {
    return { ...base, flapping: false, reason: `failed ${MAX_CONSECUTIVE + 1} nights in a row, which is an outage` }
  }
  if (rate > MAX_RATE) return { ...base, flapping: false, reason: `failed ${failed} of the last ${recent.length} nights, above ${Math.round(MAX_RATE * 100)}%` }
  return { ...base, flapping: true, reason: `failed ${failed} of the last ${recent.length} nights, and recovered within ${MAX_CONSECUTIVE}` }
}
