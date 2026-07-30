import { applySort, buildProductQuery, fail, intParam, ok } from "@/lib/catalogue"

// Catalogue changes once a day, but a stale list is worse than a slow one when
// a drop lands, so this stays short rather than matching the scrape cadence.
export const revalidate = 300

/** GET /api/dropradar/products — replaces the Go API's /api/v1/products. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const limit = intParam(params.get("limit"), 50, 1, 100)
  const offset = intParam(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER)

  const query = applySort(buildProductQuery(params), params.get("sort")).range(
    offset,
    offset + limit - 1
  )

  const { data, error, count } = await query
  if (error) return fail("Failed to fetch products")

  return ok(data ?? [], { total: count ?? 0, limit, offset })
}
