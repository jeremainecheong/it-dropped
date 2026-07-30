import { catalogue, fail, ok } from "@/lib/catalogue"

export const revalidate = 300

/** GET /api/dropradar/stats — per-region summary, from the region_stats view. */
export async function GET() {
  const { data, error } = await catalogue.from("region_stats").select("*")
  if (error) return fail("Failed to fetch stats")

  return ok(data ?? [])
}
