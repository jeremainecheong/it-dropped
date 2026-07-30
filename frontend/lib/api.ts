/**
 * Server-side catalogue access for rendering and metadata.
 *
 * Product pages, the sitemap and the OG images are generated on the server,
 * before any browser is involved, so they cannot go through the /api/dropradar
 * route handlers — those are same-origin URLs that do not exist yet at build
 * time. They read Supabase directly instead, which is the same source those
 * handlers read and one hop shorter.
 */

import { cache } from "react"

import { PRODUCT_COLUMNS, catalogue } from "@/lib/catalogue"

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://itdropped.app").replace(/\/$/, "")

export interface ApiProduct {
  id: string
  shopify_id: number
  region: string
  handle: string
  title: string
  vendor: string
  product_type: string
  tags: string[]
  total_variants: number
  available_variants?: number
  all_sizes_normalised?: string[]
  available_sizes_normalised?: string[]
  price: number
  compare_price: number | null
  currency: string
  is_available: boolean
  available_sizes: string[]
  all_sizes?: string[]
  image_url: string
  product_url: string
  style_code?: string
  color?: string
  first_seen_at: string
  last_seen_at: string
}

/**
 * Null means the product does not exist. A failed query throws.
 *
 * These used to be the same thing — `if (error) return null` — so a database
 * outage and a delisted garment produced an identical page: "Product not found",
 * served with a 200. That told a visitor the piece was gone when the truth was
 * that we could not look, and told crawlers and uptime checks that all was well.
 *
 * Throwing is the honest signal. `app/error.tsx` catches it and offers a retry,
 * which is the right response to an outage, while a genuine miss still reaches
 * `notFound()` in the caller.
 *
 * The UI is right; the status code is not. `/product/<absent-uuid>` renders the
 * branded not-found page and serves it with a 200.
 *
 * Measured, on this Next (14.2.25), with throwaway probe routes rather than by
 * reasoning about it — three plausible causes were each tested and each is
 * innocent:
 *
 *   - Moving the check into `generateMetadata`, which resolves before the
 *     response streams. Still 200, even with `notFound()` called synchronously
 *     at the top, before anything can have suspended.
 *   - The Suspense boundary `app/loading.tsx` puts above every route. Removing
 *     it does not change the status, and it cannot be removed anyway: the build
 *     depends on it for the `useSearchParams` boundaries on /compare and
 *     /login.
 *   - The custom `app/not-found.tsx`. Removing it: still 200.
 *
 * So `notFound()` on a dynamic route in this version returns 200 whatever the
 * caller does, and none of the fixes previously guessed at would have worked.
 * Left as is rather than paid for with a middleware round-trip to the database
 * on every product request. Crawlers are covered separately: `generateMetadata`
 * emits `robots: { index: false }` when the product is missing. Uptime checks
 * that watch status codes are not — a Next upgrade is the real fix.
 *
 * Wrapped in React's cache so generateMetadata and the page body share one
 * query. Next dedupes fetch() automatically, but these go through supabase-js,
 * which it cannot see, so the same product was being read twice per request.
 */
export const getProduct = cache(async function getProduct(id: string): Promise<ApiProduct | null> {
  const { data, error } = await catalogue
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Failed to read product ${id}: ${error.message}`)
  return (data as unknown as ApiProduct) ?? null
})

/** Every regional listing of the same garment, for the compare grid. */
export const getProductsByHandle = cache(async function getProductsByHandle(handle: string): Promise<ApiProduct[] | null> {
  const { data, error } = await catalogue.rpc("products_by_handle", { h: handle })
  if (error) return null
  return (data as unknown as ApiProduct[]) ?? []
})

/** Products for the sitemap. Capped — sitemaps have a 50k URL limit. */
export async function getProductsForSitemap(limit = 5000): Promise<ApiProduct[] | null> {
  const { data, error } = await catalogue
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("first_seen_at", { ascending: false })
    .limit(Math.min(limit, 5000))
  if (error) return null
  return (data as unknown as ApiProduct[]) ?? []
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$",
}

export function formatPriceServer(price: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
}
