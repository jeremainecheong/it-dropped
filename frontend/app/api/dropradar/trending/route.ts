import { PRODUCT_COLUMNS, catalogue, fail, intParam, ok } from "@/lib/catalogue"

export const revalidate = 300

/**
 * GET /api/dropradar/trending — replaces /api/v1/trending.
 *
 * "Trending" is most-recently-touched, which is what the Go route returned:
 * an unfiltered product list on its default ordering. Named for the surface
 * that consumes it rather than for any popularity signal, which we do not
 * collect.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const { data, error } = await catalogue
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("last_seen_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(intParam(params.get("limit"), 10, 1, 20))

  if (error) return fail("Failed to fetch trending products")

  return ok(data ?? [])
}
