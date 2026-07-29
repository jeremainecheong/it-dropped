/**
 * Server-side API access.
 *
 * Client components reach the Go API through the Next rewrite at
 * /api/dropradar/*, but that rewrite only exists in the browser's origin —
 * server components and metadata generation must call the API directly.
 */

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:8080").replace(/\/$/, "")

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://itdropped.app").replace(/\/$/, "")

export interface ApiProduct {
  id: string
  region: string
  handle: string
  title: string
  vendor: string
  product_type: string
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

async function apiGet<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      next: { revalidate },
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.success) return null
    return json.data as T
  } catch {
    // The API being unreachable must not break rendering — callers fall back.
    return null
  }
}

export function getProduct(id: string) {
  return apiGet<ApiProduct>(`/products/${id}`)
}

export function getProductsByHandle(handle: string) {
  return apiGet<ApiProduct[]>(`/products/by-handle/${encodeURIComponent(handle)}`)
}

/** Products for the sitemap. Capped — sitemaps have a 50k URL limit. */
export function getProductsForSitemap(limit = 5000) {
  return apiGet<ApiProduct[]>(`/products?limit=${Math.min(limit, 100)}&sort=newest`, 3600)
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", GBP: "£", EUR: "€", JPY: "¥", AUD: "A$", SGD: "S$",
}

export function formatPriceServer(price: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
}
