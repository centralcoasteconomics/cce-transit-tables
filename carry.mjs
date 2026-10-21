// Per-feed hold (2026-10-21). Before this, one failing feed held its whole county: a bad
// Metrolink night kept six counties' tables at last night's data, every other operator in them
// included. Now a feed that contributed last night and failed tonight keeps ITS OWN stops from
// the previous table (each stop carries `feedSource` = the feed's label), and every feed that
// answered publishes fresh. The carried feed is written down in the table (`carried`, label to
// the first night it was carried) so the data says how old it is, and a feed carried longer
// than MAX_CARRY_NIGHTS falls back to the old rule: the whole county is held and the run goes red.

export const MAX_CARRY_NIGHTS = 7

const dayNum = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) / 86400000

/**
 * @param {{stops: Array<{feedSource?: string}>, carried?: Record<string, string>} | null} prev
 * @param {string[]} dropped labels that contributed to `prev` and failed tonight
 * @param {string} today YYYYMMDD
 * @returns {{ ok: boolean, stops: object[], carried: Record<string, string>, reason: string }}
 */
export function carryDropped(prev, dropped, today) {
  const carried = {}
  const stops = []
  for (const label of dropped) {
    const own = (prev?.stops ?? []).filter((s) => s.feedSource === label)
    if (own.length === 0) return { ok: false, stops: [], carried: {}, reason: `${label} has no stops of its own in the previous table` }
    const since = prev?.carried?.[label] ?? today
    const nights = dayNum(today) - dayNum(since)
    if (nights >= MAX_CARRY_NIGHTS) {
      return { ok: false, stops: [], carried: {}, reason: `${label} has been carried since ${since} (${nights} nights, limit ${MAX_CARRY_NIGHTS})` }
    }
    carried[label] = since
    stops.push(...own)
  }
  return { ok: true, stops, carried, reason: '' }
}
