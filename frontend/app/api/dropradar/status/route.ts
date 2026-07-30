import { catalogue, fail, ok } from "@/lib/catalogue"

// Liveness, so never cached.
export const dynamic = "force-dynamic"

/**
 * GET /api/dropradar/status — is the catalogue reachable and how fresh is it.
 *
 * The Go version also echoed scrape_logs, including error_message, to anyone
 * who asked. That table is operational telemetry and is no longer world
 * readable (migration 013), so this reports freshness only.
 */
export async function GET() {
  const { data, error } = await catalogue
    .from("products")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return fail("Catalogue unreachable", 503)

  return ok({
    status: "ok",
    timestamp: new Date().toISOString(),
    last_scrape_at: data?.last_seen_at ?? null,
  })
}
