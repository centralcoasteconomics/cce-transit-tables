// The flapping rule (flap.mjs). Run with `npm test`. No network.
import { recordNight, flapStatus, WINDOW } from './flap.mjs'

let fail = 0
const ok = (name, cond, detail = '') => { if (cond) console.log(`  ok   ${name}`); else { fail++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`) } }
const days = (n, end = 20261018) => Array.from({ length: n }, (_, i) => String(end - (n - 1 - i)))
const build = (pattern) => { // pattern string, oldest first: '1' = ok, '0' = failed; last = tonight
  const h = {}, ds = days(pattern.length)
  ;[...pattern].forEach((c, i) => recordNight(h, 'x/feed', ds[i], c === '1'))
  return { h, today: ds.at(-1) }
}
const st = (p) => { const { h, today } = build(p); return flapStatus(h, 'x/feed', today) }

ok('the 10/13 to 10/18 shape (one night in two) flaps', st('11111101010').flapping === true, st('11111101010').reason)
ok('a green night is not a flap', st('11111111').flapping === false)
ok('three failures in a row is an outage, red', st('1111111000').flapping === false && /in a row/.test(st('1111111000').reason))
ok('two in a row still flaps', st('111111100').flapping === true)
ok('a new feed with under 7 nights earns nothing', st('1110').flapping === false && /history/.test(st('1110').reason))
ok('above half the window failing is red', st('10100101010100').flapping === false, st('10100101010100').reason)
ok('exactly half flaps', st('10101010101010').flapping === true, st('10101010101010').reason)
ok('the rate counts only the window', st('0000000000' + '11111111111110').rate === 1 / WINDOW)
{
  const h = {}
  for (const d of days(40)) recordNight(h, 'x/feed', d, true)
  ok('history stays small', Object.keys(h['x/feed']).length <= WINDOW + 7)
}
ok('the reasons carry no em or en dashes', ['11111101010', '1111111000', '1110'].every((p) => !/[–—]/.test(st(p).reason)))
console.log(`\ntest-flap ${fail ? `${fail} FAILED` : 'all passed'}`)
process.exit(fail ? 1 : 0)
