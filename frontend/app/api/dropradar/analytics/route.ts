import { catalogue, fail, intParam, ok } from "@/lib/catalogue"

export const revalidate = 300

/**
 * GET /api/dropradar/analytics — replaces /api/v1/analytics.
 *
 * The Go handler ran three queries and merged them; analytics_summary returns
 * the same {drop_activity, price_bands, categories} object in one round trip.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const { data, error } = await catalogue.rpc("analytics_summary", {
    days: intParam(params.get("days"), 30, 1, 365),
  })
  if (error) return fail("Failed to fetch analytics")

  return ok(data ?? { drop_activity: [], price_bands: [], categories: [] })
}
