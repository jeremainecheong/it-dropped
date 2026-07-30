/**
 * Catalogue reads, straight from Supabase.
 *
 * These replace the Go API's 13 read-only GET routes. The catalogue tables are
 * readable by anyone (migration 013 enables RLS with a SELECT-only policy), so
 * the publishable key is the right credential here and no service key is
 * involved — nothing in this file can write.
 *
 * The queries PostgREST cannot express — ranked search, the handle-to-style-code
 * resolution, the stats CTEs, the analytics aggregates — live in Postgres as
 * functions and a view, added by migration 014.
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** One client per server process; these reads carry no user session. */
export const catalogue = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * The same reads, never cached. For anything whose whole job is to report the
 * present.
 *
 * `export const dynamic = "force-dynamic"` does not cover this. It governs the
 * route's own rendering and the fetches Next issues on its behalf; the request
 * here is made inside supabase-js, and it landed in the Data Cache with no
 * revalidation — that is, forever.
 *
 * Which is worse than it sounds, because the Data Cache **survives
 * deployments**. `/status` spent a day reporting a `last_scrape_at` from the
 * previous afternoon while the products table was being written to every few
 * minutes. Redeploying did not clear it. A cache-buster on the route did not
 * either: the cache is keyed on the upstream Supabase URL, which a query
 * parameter on our own route never reaches. The tell was that the value it
 * returned matched no row in the table at all.
 *
 * Routes with a `revalidate` were unaffected — their entries expire. It is
 * specifically the ones asking not to be cached that were cached hardest.
 */
export const catalogueLive = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
})

/** The columns the Go API returned. Selecting explicitly keeps the payload —
 *  and Supabase's egress allowance — off the search_vector column. */
export const PRODUCT_COLUMNS =
  "id,shopify_id,region,handle,title,vendor,product_type,tags,price,compare_price," +
  "currency,is_available,available_sizes,total_variants,image_url,product_url," +
  "first_seen_at,last_seen_at,style_code,color,all_sizes,available_variants,published_at," +
  // Migration 021. Without these the size matrix silently falls back to the raw
  // runs, and Singapore's "Size Medium" never lands in the same row as "M".
  "all_sizes_normalised,available_sizes_normalised"

export interface Meta {
  total?: number
  limit?: number
  offset?: number
}

/** The Go API's envelope, preserved exactly so no call site has to change. */
export function ok(data: unknown, meta?: Meta) {
  return Response.json(meta ? { success: true, data, meta } : { success: true, data })
}

export function fail(message: string, status = 500) {
  return Response.json({ success: false, error: message }, { status })
}

/** Clamp a query-string integer the way the Go handlers did, so an absent or
 *  junk value falls back rather than erroring. */
export function intParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  if (Number.isNaN(n) || n < min || n > max) return fallback
  return n
}

/** Whitelisted sorts. An unknown value falls back to newest, matching Go's
 *  `default:` branch — a caller cannot inject an ordering. */
export function applySort(
  query: ReturnType<typeof buildProductQuery>,
  sort: string | null
) {
  switch (sort) {
    case "price_asc":
      return query.order("price_usd", { ascending: true }).order("id", { ascending: true })
    case "price_desc":
      return query.order("price_usd", { ascending: false }).order("id", { ascending: true })
    case "newest":
      return query.order("first_seen_at", { ascending: false }).order("id", { ascending: true })
    default:
      return query.order("last_seen_at", { ascending: false }).order("id", { ascending: true })
  }
}

/**
 * Shared product SELECT with the Go handler's filters.
 *
 * `count: "exact"` replaces the second COUNT(*) round trip the Go code made:
 * PostgREST returns the total alongside the rows.
 */
export function buildProductQuery(params: URLSearchParams) {
  let query = catalogue.from("products").select(PRODUCT_COLUMNS, { count: "exact" })

  const region = params.get("region")
  if (region) query = query.eq("region", region)

  const productType = params.get("product_type")
  if (productType) query = query.in("product_type", productType.split(","))

  const available = params.get("available")
  if (available === "true") query = query.eq("is_available", true)
  else if (available === "false") query = query.eq("is_available", false)

  return query
}
