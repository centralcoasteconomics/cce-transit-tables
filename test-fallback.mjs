// The fallback URL (fallback.mjs). Run with `npm test`. No network: fetchOne is a stub.
import { downloadWithFallback } from './fallback.mjs'

let fail = 0
const ok = (name, cond, detail = '') => { if (cond) console.log(`  ok   ${name}`); else { fail++; console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`) } }
const stub = (good) => {
  const calls = []
  const fn = async (url) => { calls.push(url); if (good.includes(url)) return { 'stops.txt': url }; throw new Error(`HTTP 403 at ${url}`) }
  return { fn, calls }
}
const feed = { id: 'lbt', url: 'https://a/primary.zip', fallbackUrl: 'https://b/mirror.zip' }

{
  const s = stub([feed.url, feed.fallbackUrl])
  const r = await downloadWithFallback(feed, s.fn)
  ok('a healthy primary is used and the fallback is never fetched', r.url === feed.url && !r.usedFallback && s.calls.length === 1)
}
{
  const s = stub([feed.fallbackUrl])
  const warned = []
  const r = await downloadWithFallback(feed, s.fn, (m) => warned.push(m))
  ok('a failed primary falls back to fallbackUrl', r.usedFallback && r.url === feed.fallbackUrl && r.zip['stops.txt'] === feed.fallbackUrl)
  ok('the order is url first, then fallbackUrl', s.calls.join(' ') === `${feed.url} ${feed.fallbackUrl}`)
  ok('the fallback is logged', warned.length === 1 && /trying fallback/.test(warned[0]))
}
{
  const s = stub([])
  let err = null
  try { await downloadWithFallback(feed, s.fn) } catch (e) { err = e }
  ok('both failing throws, naming both errors', err && /primary: .*primary\.zip.*fallback: .*mirror\.zip/.test(err.message), err?.message)
}
{
  const s = stub([])
  const plain = { id: 'x', url: 'https://a/only.zip' }
  let err = null
  try { await downloadWithFallback(plain, s.fn) } catch (e) { err = e }
  ok('a feed without fallbackUrl fails as before, with its own error', err && err.message === 'HTTP 403 at https://a/only.zip' && s.calls.length === 1)
}
{
  const s = stub([])
  let err = null
  try { await downloadWithFallback({ ...feed, fallbackUrl: feed.url }, s.fn) } catch (e) { err = e }
  ok('a fallbackUrl equal to url is not fetched twice', err && s.calls.length === 1)
}

if (fail) { console.log(`\n${fail} fallback check(s) failed`); process.exit(1) }
console.log('\nfallback: all checks passed')
