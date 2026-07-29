import { catalogue, fail, ok } from "@/lib/catalogue"

export const revalidate = 300

/**
 * GET /api/dropradar/products/by-handle/:handle — every region carrying the
 * same garment. The handle identifies a listing; style_code identifies the
 * garment, and resolving one to the other is a scalar subquery, so it lives
 * in the products_by_handle function.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params

  const { data, error } = await catalogue.rpc("products_by_handle", {
    h: decodeURIComponent(handle),
  })
  if (error) return fail("Failed to fetch related products")

  return ok(data ?? [])
}
