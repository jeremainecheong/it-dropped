import { PRODUCT_COLUMNS, catalogue, fail, ok } from "@/lib/catalogue"

export const revalidate = 300

/** GET /api/dropradar/products/:id — replaces /api/v1/products/:id. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data, error } = await catalogue
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", id)
    .maybeSingle()

  // maybeSingle returns null rather than erroring on no rows, so a missing
  // product is a 404 and not a 500 — the Go handler drew the same line.
  if (error) return fail("Failed to fetch product")
  if (!data) return fail("Product not found", 404)

  return ok(data)
}
