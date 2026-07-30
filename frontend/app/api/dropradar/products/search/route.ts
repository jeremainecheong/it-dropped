import { catalogue, fail, intParam, ok } from "@/lib/catalogue"

export const revalidate = 60

/**
 * GET /api/dropradar/products/search — replaces /api/v1/products/search.
 *
 * Ranked by ts_rank, which depends on the query text and so can never be a
 * stored column; the ordering lives in the search_products function.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const q = params.get("q")?.trim()
  if (!q) return fail("Query parameter 'q' is required", 400)

  const { data, error } = await catalogue.rpc("search_products", {
    q,
    p_region: params.get("region") || null,
    lim: intParam(params.get("limit"), 20, 1, 50),
  })
  if (error) return fail("Failed to search products")

  return ok(data ?? [])
}
