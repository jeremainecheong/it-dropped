import { FALLBACK_FX_TO_USD, type FxRates } from "@/lib/currency"

/**
 * GET /api/dropradar/fx — current exchange rates, as rates-to-USD.
 *
 * Cached for six hours. The upstream is the European Central Bank's daily
 * reference rates via Frankfurter, which publishes once per working day, so
 * anything shorter is requests spent on a number that has not moved.
 *
 * Fetched here rather than in the browser because a strict CSP has no reason
 * to allow a third-party origin, and because one cached fetch serves every
 * visitor instead of one per visitor.
 *
 * A failure returns the static table with `live: false` rather than an error.
 * The rates exist to rank listings and show an indicative delivered cost;
 * yesterday's are fine for that, and a comparison page that renders nothing
 * because a rates feed is down is worse than one that is a percent stale.
 */
export const revalidate = 21600

const CURRENCIES = ["GBP", "EUR", "JPY", "AUD", "SGD"] as const

interface FxResponse {
  rates: FxRates
  live: boolean
  date: string | null
}

export async function GET() {
  const fallback: FxResponse = { rates: FALLBACK_FX_TO_USD, live: false, date: null }

  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CURRENCIES.join(",")}`,
      { signal: AbortSignal.timeout(8000), next: { revalidate } },
    )
    if (!res.ok) return Response.json(fallback)

    const body = (await res.json()) as { rates?: Record<string, number>; date?: string }
    if (!body.rates) return Response.json(fallback)

    // Frankfurter quotes units of X per 1 USD; everything here is USD per 1 X.
    const rates: FxRates = { USD: 1 }
    for (const code of CURRENCIES) {
      const perUSD = body.rates[code]
      // A zero or missing rate would divide to Infinity and price every
      // listing from that region at nothing.
      if (typeof perUSD !== "number" || !Number.isFinite(perUSD) || perUSD <= 0) {
        rates[code] = FALLBACK_FX_TO_USD[code]
        continue
      }
      rates[code] = 1 / perUSD
    }

    return Response.json({ rates, live: true, date: body.date ?? null } satisfies FxResponse)
  } catch {
    return Response.json(fallback)
  }
}
