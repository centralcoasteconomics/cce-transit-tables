#!/usr/bin/env node
/**
 * GTFS → compact peak-headway tables for Site Due Diligence (cloud engine).
 *
 * For every stop in every county feed: AM (7–9a) and PM (4–6p) peak departure counts
 * on a representative weekday, plus the best route type serving it. The cloud engine
 * filters these by radius and applies the same headway math as the desktop engine
 * (headway = 120min / departures; frequency test = both windows ≤ 30min) — so the
 * heavy 20MB+ feed parsing happens here (GitHub Actions, nightly), not in the Worker.
 *
 * Output: tables/<county>.json
 * Parity source: app src/main/connectors/transit/gtfs.ts (2026-08; keep in sync).
 */
import { unzipSync, strFromU8 } from 'fflate'
import { parse } from 'csv-parse/sync'
import { writeFileSync, mkdirSync } from 'node:fs'

const AM_START = 7 * 3600, AM_END = 9 * 3600
const PM_START = 16 * 3600, PM_END = 18 * 3600

const COUNTY_FEEDS = {
  ventura: [{ id: 'govcbus', url: 'https://govcbus.com/gtfs', label: 'Ventura County (combined GTFS)' }],
  'los-angeles': [
    { id: 'lametro_bus', url: 'https://gitlab.com/LACMTA/gtfs_bus/-/raw/master/gtfs_bus.zip', label: 'LA Metro Bus' },
    { id: 'lametro_rail', url: 'https://gitlab.com/LACMTA/gtfs_rail/-/raw/master/gtfs_rail.zip', label: 'LA Metro Rail' },
    { id: 'foothill', url: 'https://foothilltransit.rideralerts.com/myStop/GTFS-Zip.ashx', label: 'Foothill Transit' },
    { id: 'ladot', url: 'https://ladotbus.com/gtfs', label: 'LADOT (DASH/Commuter Express)' },
    { id: 'bigbluebus', url: 'https://gtfs.bigbluebus.com/current.zip', label: 'Big Blue Bus (Santa Monica)' }
  ],
  'santa-barbara': [{ id: 'sbmtd', url: 'https://www.sbmtd.gov/google_transit/feed.zip', label: 'Santa Barbara MTD' }],
  'san-luis-obispo': [
    { id: 'slorta', url: 'http://slo.connexionz.net/rtt/public/resource/gtfs.zip', label: 'SLO Regional Transit Authority' },
    { id: 'slotransit', url: 'http://slocity.connexionz.net/rtt/public/resource/gtfs.zip', label: 'SLO Transit (city)' }
  ]
}

const toSec = (t) => {
  if (!t) return null
  const p = t.split(':')
  if (p.length < 3) return null
  const s = Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2])
  return Number.isFinite(s) ? s : null
}
const csv = (buf) => buf ? parse(strFromU8(buf), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) : []
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

// Representative-weekday service selection — ported verbatim in behavior from gtfs.ts.
function computeActiveServices(calendar, calendarDates) {
  const minStart = calendar.reduce((m, c) => Math.min(m, c.start), Infinity)
  const activeFor = (d) => {
    const key = Number(ymd(d)), dow = d.getDay(), ids = new Set()
    for (const c of calendar) if (key >= c.start && key <= c.end && c.days[dow]) ids.add(c.service_id)
    const ex = calendarDates.get(String(key))
    if (ex) { for (const s of ex.add) ids.add(s); for (const s of ex.remove) ids.delete(s) }
    return ids
  }
  const base = new Date()
  const wed = new Date(base); wed.setDate(base.getDate() + ((3 - base.getDay() + 7) % 7))
  const candidates = [wed]
  if (Number.isFinite(minStart)) {
    const s = String(minStart)
    const mid = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
    mid.setDate(mid.getDate() + ((3 - mid.getDay() + 7) % 7) + 7)
    candidates.push(mid)
  }
  for (const c of candidates) { const ids = activeFor(c); if (ids.size > 0) return { ids, label: ymd(c) } }
  const scanStart = Number.isFinite(minStart)
    ? new Date(Number(String(minStart).slice(0, 4)), Number(String(minStart).slice(4, 6)) - 1, Number(String(minStart).slice(6, 8)))
    : new Date()
  for (let i = 0; i < 400; i++) {
    const d = new Date(scanStart); d.setDate(scanStart.getDate() + i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const ids = activeFor(d)
    if (ids.size > 0) return { ids, label: ymd(d) }
  }
  return { ids: new Set(), label: 'none' }
}

const freqCountInWindow = (f, ws, we) => {
  const a = Math.max(f.start, ws), b = Math.min(f.end, we)
  return b <= a ? 0 : Math.floor((b - a) / f.headway) + 1
}
const routeTypeToStop = (rt) => rt === 0 ? 'light_rail' : rt === 1 ? 'rail' : rt === 2 ? 'commuter_rail' : rt === 4 ? 'ferry' : 'bus_stop'
const RANK = ['bus_stop', 'bus_station', 'brt', 'light_rail', 'commuter_rail', 'rail', 'ferry']

function pick(line, start, end, wanted) {
  const res = new Array(wanted.length).fill('')
  const maxCol = wanted[wanted.length - 1]
  let col = 0, fieldStart = start
  for (let i = start; i <= end; i++) {
    if (i === end || line.charCodeAt(i) === 44) {
      const wi = wanted.indexOf(col)
      if (wi >= 0) res[wi] = line.slice(fieldStart, i)
      col++; fieldStart = i + 1
      if (col > maxCol) break
    }
  }
  return res
}

async function processFeed(feed) {
  console.log(`  ${feed.id}: downloading ${feed.url}`)
  const res = await fetch(feed.url, { headers: { 'User-Agent': 'cce-transit-tables (Central Coast Economics; nightly GTFS preprocessing)' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()))
  const stops = new Map()
  for (const r of csv(zip['stops.txt'])) {
    const lat = Number(r.stop_lat), lng = Number(r.stop_lon)
    if (Number.isFinite(lat) && Number.isFinite(lng)) stops.set(r.stop_id, { lat, lng, name: r.stop_name ?? '' })
  }
  const routeType = new Map(csv(zip['routes.txt']).map((r) => [r.route_id, Number(r.route_type ?? 3)]))
  const trips = new Map(csv(zip['trips.txt']).map((r) => [r.trip_id, { serviceId: r.service_id, routeType: routeType.get(r.route_id) ?? 3 }]))
  const freqByTrip = new Map()
  for (const r of csv(zip['frequencies.txt'])) {
    const s = toSec(r.start_time), e = toSec(r.end_time), h = Number(r.headway_secs)
    if (s == null || e == null || !Number.isFinite(h) || h <= 0) continue
    const arr = freqByTrip.get(r.trip_id) ?? []
    arr.push({ start: s, end: e, headway: h }); freqByTrip.set(r.trip_id, arr)
  }
  const calendar = csv(zip['calendar.txt']).map((r) => ({
    service_id: r.service_id,
    days: [r.sunday, r.monday, r.tuesday, r.wednesday, r.thursday, r.friday, r.saturday].map((v) => v === '1'),
    start: Number(r.start_date), end: Number(r.end_date)
  }))
  const calendarDates = new Map()
  for (const r of csv(zip['calendar_dates.txt'])) {
    const e = calendarDates.get(r.date) ?? { add: new Set(), remove: new Set() }
    if (r.exception_type === '1') e.add.add(r.service_id); else e.remove.add(r.service_id)
    calendarDates.set(r.date, e)
  }
  const { ids: active, label: refDate } = computeActiveServices(calendar, calendarDates)

  // Single pass over stop_times for ALL stops (the desktop engine does this point-aware;
  // here we accumulate everything so the Worker never has to touch the raw feed).
  const stBuf = zip['stop_times.txt']
  if (!stBuf) throw new Error('no stop_times.txt')
  const text = strFromU8(stBuf)
  const header = text.slice(0, text.indexOf('\n')).replace(/\r$/, '').split(',').map((h) => h.trim())
  const colTrip = header.indexOf('trip_id'), colDep = header.indexOf('departure_time'), colStop = header.indexOf('stop_id')
  if (colTrip < 0 || colDep < 0 || colStop < 0) throw new Error('stop_times missing columns')
  const wanted = [colTrip, colDep, colStop].slice().sort((a, b) => a - b)
  const iTrip = wanted.indexOf(colTrip), iDep = wanted.indexOf(colDep), iStop = wanted.indexOf(colStop)

  const acc = new Map()
  let pos = text.indexOf('\n') + 1
  const len = text.length
  while (pos < len) {
    let nl = text.indexOf('\n', pos)
    if (nl < 0) nl = len
    const f = pick(text, pos, nl, wanted)
    pos = nl + 1
    const tripId = f[iTrip].trim()
    const trip = trips.get(tripId)
    if (!trip || !active.has(trip.serviceId)) continue
    const stopId = f[iStop].trim()
    const a = acc.get(stopId) ?? { am: 0, pm: 0, bestRt: 3 }
    const freqs = freqByTrip.get(tripId)
    if (freqs && freqs.length) {
      for (const fr of freqs) { a.am += freqCountInWindow(fr, AM_START, AM_END); a.pm += freqCountInWindow(fr, PM_START, PM_END) }
    } else {
      const sec = toSec(f[iDep].trim())
      if (sec != null) {
        if (sec >= AM_START && sec < AM_END) a.am++
        if (sec >= PM_START && sec < PM_END) a.pm++
      }
    }
    if (RANK.indexOf(routeTypeToStop(trip.routeType)) > RANK.indexOf(routeTypeToStop(a.bestRt))) a.bestRt = trip.routeType
    acc.set(stopId, a)
  }

  const out = []
  for (const [id, a] of acc) {
    if (a.am === 0 && a.pm === 0) continue
    const s = stops.get(id)
    if (!s) continue
    out.push({
      name: s.name, lat: s.lat, lng: s.lng,
      am: a.am, pm: a.pm, stopType: routeTypeToStop(a.bestRt), feedSource: feed.label
    })
  }
  console.log(`  ${feed.id}: ${out.length} stops with peak service (ref weekday ${refDate})`)
  return { refDate, stops: out }
}

mkdirSync('tables', { recursive: true })
const summary = []
for (const [county, feeds] of Object.entries(COUNTY_FEEDS)) {
  console.log(`${county}:`)
  const stops = []
  const labels = []
  let refDate = 'none'
  for (const feed of feeds) {
    try {
      const r = await processFeed(feed)
      stops.push(...r.stops)
      labels.push(feed.label)
      if (r.refDate !== 'none') refDate = r.refDate
    } catch (e) {
      console.error(`  ${feed.id}: FAILED — ${e.message} (keeping previous table's data absent for this feed)`)
    }
  }
  const table = { generatedAt: new Date().toISOString(), county, refDate, feeds: labels, stops }
  writeFileSync(`tables/${county}.json`, JSON.stringify(table))
  summary.push(`${county}: ${stops.length} stops, ${labels.length}/${feeds.length} feeds`)
}
console.log('\n' + summary.join('\n'))
