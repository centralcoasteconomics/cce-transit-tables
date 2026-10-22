// Fallback URL (2026-10-22). A feed may carry `fallbackUrl` next to `url` in transitFeeds.json:
// a second, independently hosted copy of the SAME feed (for Long Beach Transit, the agency's
// own Google Drive link first, then the Mobility Database's hosted copy). The primary is tried
// first with its usual retries; only when every attempt fails is the fallback tried. A feed
// without a fallbackUrl behaves exactly as before. Which URL answered is returned, so the run
// log says when a table was built from the mirror.

/**
 * @param {{ id: string, url: string, fallbackUrl?: string }} feed
 * @param {(url: string) => Promise<any>} fetchOne downloads and unzips one URL (with its own retries); throws on failure
 * @param {(msg: string) => void} [warn]
 * @returns {Promise<{ zip: any, url: string, usedFallback: boolean }>}
 */
export async function downloadWithFallback(feed, fetchOne, warn = () => {}) {
  try {
    return { zip: await fetchOne(feed.url), url: feed.url, usedFallback: false }
  } catch (e) {
    if (!feed.fallbackUrl || feed.fallbackUrl === feed.url) throw e
    warn(`  ${feed.id}: primary failed (${e.message}); trying fallback ${feed.fallbackUrl}`)
    try {
      return { zip: await fetchOne(feed.fallbackUrl), url: feed.fallbackUrl, usedFallback: true }
    } catch (e2) {
      throw new Error(`primary: ${e.message}; fallback: ${e2.message}`)
    }
  }
}
