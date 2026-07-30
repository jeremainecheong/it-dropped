/**
 * GET /api/diag/store-reachability — can this host reach the storefronts?
 *
 * Not under `_diag`: the App Router treats an underscore-prefixed folder as
 * private and opts it out of routing entirely, so that path 404s by design.
 *
 * TEMPORARY. The daily scrape runs from a GitHub Actions runner, whose address
 * the stores answer `429` with a `Retry-After` of a minute or more — on the
 * very first request of a run, before we have asked for anything. That is a
 * fact about the address, not about how politely the scraper asks, so the only
 * question worth answering is which of our hosts can reach the stores at all.
 * This answers it for Vercel.
 *
 * The URL list is hardcoded. This must never take a target from the caller:
 * an endpoint that fetches a URL you hand it is an open proxy, and this one is
 * unauthenticated.
 */

export const dynamic = "force-dynamic"
export const maxDuration = 30

const STORES: Record<string, string> = {
  us: "https://www.stussy.com",
  uk: "https://uk.stussy.com",
  eu: "https://eu.stussy.com",
  jp: "https://www.stussy.jp",
  au: "https://stussy.com.au",
  sg: "https://shop-sg.doverstreetmarket.com/collections/shops-stussy",
}

async function probe(region: string, base: string) {
  const started = Date.now()
  try {
    const res = await fetch(`${base}/products.json?limit=1`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })

    // Count the products rather than trusting the status: a bot wall that
    // answers 200 with an empty list looks identical to a healthy store until
    // you read the body.
    let products: number | null = null
    if (res.ok) {
      try {
        const body = await res.json()
        products = Array.isArray(body?.products) ? body.products.length : null
      } catch {
        products = null
      }
    }

    return {
      region,
      status: res.status,
      retry_after: res.headers.get("retry-after"),
      products,
      ms: Date.now() - started,
    }
  } catch (err) {
    return {
      region,
      status: null,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    }
  }
}

export async function GET() {
  const results = await Promise.all(
    Object.entries(STORES).map(([region, base]) => probe(region, base)),
  )

  const reachable = results.filter((r) => r.status === 200).length
  return Response.json(
    { reachable, total: results.length, results },
    { headers: { "cache-control": "no-store" } },
  )
}
