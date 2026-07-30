import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/api"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal and transient surfaces carry no search value and, in the
        // case of search, would let a crawler generate unbounded URLs.
        disallow: ["/api/", "/auth/", "/profile", "/wishlist"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
