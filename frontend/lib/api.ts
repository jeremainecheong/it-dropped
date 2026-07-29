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
 * A missing product must render a 404, not crash the route — every caller here
 * already branches on null.
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
  if (error) return null
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
