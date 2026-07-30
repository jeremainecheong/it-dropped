import { timingSafeEqual } from "node:crypto"

/**
 * GET /api/scrape/store?region=us&page=1 — a storefront's products.json,
 * fetched from here and returned verbatim.
 *
 * This exists because of where the scraper runs, not what it does. The daily
 * job runs on a GitHub Actions runner, and the stores answer that address 429
 * with a Retry-After of a minute or more — on the first request of a run,
 * before it has asked for anything. It is a property of the address: the same
 * code from here reaches all six stores in about 130ms each. So the fetch
 * moves to Vercel and everything else stays in Go, where it is tested.
 *
 * Two rules keep this from being an open proxy, which is what an endpoint that
 * fetches a URL for a caller otherwise is:
 *
 *   1. `region` is a key into the map below, never a URL. There is no input
 *      that makes this fetch a host that is not written here.
 *   2. A bearer token is required, and without one configured this refuses
 *      every request rather than falling open.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

// Mirrors backend/internal/scraper/regions.go. A region added there and not
// here is a region the scraper cannot reach.
const STORES: Record<string, string> = {
  us: "https://www.stussy.com",
  uk: "https://uk.stussy.com",
  eu: "https://eu.stussy.com",
  jp: "https://www.stussy.jp",
  au: "https://stussy.com.au",
  sg: "https://shop-sg.doverstreetmarket.com/collections/shops-stussy",
}

// Matches maxPages in the Go client. A page number beyond the scraper's own
// runaway guard is not a request the scraper makes.
const MAX_PAGE = 40

const UPSTREAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Constant-time bearer check, length-safe. */
function authorised(req: Request): boolean {
  const expected = process.env.SCRAPE_PROXY_TOKEN
  if (!expected) return false

  const header = req.headers.get("authorization") ?? ""
  const presented = header.startsWith("Bearer ") ? header.slice(7) : ""

  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which would leak length by
  // way of a 500 instead of a 401.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(req: Request) {
  if (!authorised(req)) {
    return Response.json({ error: "unauthorised" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const region = params.get("region") ?? ""
  const base = STORES[region]
  if (!base) {
    return Response.json({ error: "unknown region" }, { status: 400 })
  }

  const page = Number(params.get("page") ?? "1")
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    return Response.json({ error: "page out of range" }, { status: 400 })
  }

  let upstream: Response
  try {
    upstream = await fetch(`${base}/products.json?limit=250&page=${page}`, {
      headers: {
        "User-Agent": UPSTREAM_UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
  } catch (err) {
    // 502 rather than 500: the scraper retries gateway errors, and a store
    // that timed out is worth another attempt.
    return Response.json(
      { error: "upstream fetch failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  // Status and Retry-After are passed through untouched. The scraper already
  // knows how to read a 429 and how long to wait; hiding either behind a 200
  // would strand that logic.
  const headers: HeadersInit = { "content-type": "application/json", "cache-control": "no-store" }
  const retryAfter = upstream.headers.get("retry-after")
  if (retryAfter) headers["retry-after"] = retryAfter

  return new Response(await upstream.text(), { status: upstream.status, headers })
}
