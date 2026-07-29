import type { MetadataRoute } from "next"
import { getProductsForSitemap, SITE_URL } from "@/lib/api"

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/drops`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/shop`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/community`, changeFrequency: "daily", priority: 0.5 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.3 },
  ]

  // If the API is unreachable at build time, still emit a valid sitemap of
  // the static routes rather than failing the build.
  const products = await getProductsForSitemap()
  if (!products?.length) return staticRoutes

  return [
    ...staticRoutes,
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.id}`,
      lastModified: p.last_seen_at ? new Date(p.last_seen_at) : undefined,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ]
}
