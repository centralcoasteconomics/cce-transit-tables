// The per-feed hold (carry.mjs). Run with `npm test`. No network.
import { carryDropped, MAX_CARRY_NIGHTS } from './carry.mjs'

let fail = 0
const ok = (name, cond, detail = '') => { if (cond) console.log(`  ok   ${name}`); else { fail++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`) } }
const prev = {
  feeds: ['Metrolink', 'Bus A'],
  stops: [
    { name: 'Station', feedSource: 'Metrolink' },
    { name: 'Stop 1', feedSource: 'Bus A' },
    { name: 'Stop 2', feedSource: 'Bus A' },
  ],
}

{
  const r = carryDropped(prev, ['Metrolink'], '20261021')
  ok('a dropped feed keeps only its own stops', r.ok && r.stops.length === 1 && r.stops[0].feedSource === 'Metrolink')
  ok('the first carried night is tonight', r.carried.Metrolink === '20261021')
}
{
  const r = carryDropped({ ...prev, carried: { Metrolink: '20261018' } }, ['Metrolink'], '20261021')
  ok('a feed already carried keeps its first night', r.ok && r.carried.Metrolink === '20261018')
}
{
  const r = carryDropped({ ...prev, carried: { Metrolink: '20261014' } }, ['Metrolink'], '20261021')
  ok(`carried ${MAX_CARRY_NIGHTS} nights holds the county`, !r.ok && /limit/.test(r.reason), r.reason)
}
{
  const r = carryDropped({ ...prev, carried: { Metrolink: '20261030' } }, ['Metrolink'], '20261102')
  ok('the night count crosses a month', r.ok && r.carried.Metrolink === '20261030')
}
{
  const r = carryDropped(prev, ['Bus B'], '20261021')
  ok('a feed with no stops of its own cannot be carried', !r.ok)
}
{
  const r = carryDropped(prev, ['Metrolink', 'Bus B'], '20261021')
  ok('one uncarriable feed holds the county', !r.ok && r.stops.length === 0)
}
{
  const r = carryDropped({ ...prev, generatedAt: '2026-09-20T10:30:00.000Z' }, ['Metrolink'], '20261021')
  ok('a table held for a month is not carried again', !r.ok, r.reason)
  const y = carryDropped({ ...prev, generatedAt: '2026-10-20T10:30:00.000Z' }, ['Metrolink'], '20261021')
  ok('a table built last night counts from last night', y.ok && y.carried.Metrolink === '20261020')
}
ok('the reasons carry no em or en dashes', !/[–—]/.test(carryDropped(prev, ['Bus B'], '20261021').reason))
console.log(`\ntest-carry ${fail ? `${fail} FAILED` : 'all passed'}`)
process.exit(fail ? 1 : 0)
