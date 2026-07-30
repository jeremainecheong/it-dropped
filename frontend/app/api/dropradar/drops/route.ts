import { catalogue, fail, intParam, ok } from "@/lib/catalogue"

export const revalidate = 60

const DROP_COLUMNS =
  "id,product_id,shopify_id,region,change_type,title,price,currency," +
  "image_url,product_url,old_value,new_value,available_sizes," +
  "detected_at,notified,notified_at"

/** GET /api/dropradar/drops — replaces /api/v1/drops. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const limit = intParam(params.get("limit"), 50, 1, 100)
  const offset = intParam(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER)

  let query = catalogue
    .from("drops")
    .select(DROP_COLUMNS, { count: "exact" })
    .order("detected_at", { ascending: false })

  const region = params.get("region")
  if (region) query = query.eq("region", region)

  const changeType = params.get("type")
  if (changeType) query = query.eq("change_type", changeType)

  // Absent means "either"; only an explicit true/false filters, matching the
  // Go handler's *bool.
  const notified = params.get("notified")
  if (notified === "true") query = query.eq("notified", true)
  else if (notified === "false") query = query.eq("notified", false)

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error) return fail("Failed to fetch drops")

  return ok(data ?? [], { total: count ?? 0, limit, offset })
}
