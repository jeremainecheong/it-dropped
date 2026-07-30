import { catalogue, fail, intParam, ok } from "@/lib/catalogue"
import { categoryOf } from "@/lib/categories"
import { toUSD } from "@/lib/currency"

// Entries expire — which is the point. The deliberately-uncached client is the
// one that gets pinned forever (see lib/catalogue.ts); a revalidating route on
// the plain client is the configuration that actually stays fresh.
export const revalidate = 60

/** Only what the grouping needs. The full PRODUCT_COLUMNS drags search_vector
 *  adjacent columns and per-store size spellings this route never returns. */
const STYLE_COLUMNS =
  "id,region,handle,style_code,title,product_type,price,currency,is_available," +
  "available_sizes_normalised,all_sizes_normalised,image_url,product_url," +
  "first_seen_at,published_at"

interface Row {
  id: string
  region: string
  handle: string
  style_code: string | null
  title: string
  product_type: string | null
  price: number
  currency: string
  is_available: boolean
  available_sizes_normalised: string[] | null
  all_sizes_normalised: string[] | null
  image_url: string | null
  product_url: string
  first_seen_at: string | null
  published_at: string | null
}

interface StyleGroup {
  styleKey: string
  title: string
  /** Bucket key from lib/categories, or null for types outside the vocabulary. */
  category: string | null
  image: string | null
  publishedAt: string | null
  anyAvailable: boolean
  sizes: string[]
  availableSizes: string[]
  listings: {
    id: string
    region: string
    price: number
    currency: string
    isAvailable: boolean
    availableSizesNormalised: string[]
    productUrl: string
  }[]
}

/**
 * The whole catalogue, in PostgREST's 1000-row pages.
 *
 * Grouping by style_code cannot be pushed down — PostgREST has no GROUP BY —
 * and any server-side page of ROWS would split a garment's regional listings
 * across pages. So the route reads everything (~6k rows of narrow columns,
 * cached for `revalidate` seconds) and paginates over groups instead.
 */
async function fetchAllRows(): Promise<Row[]> {
  const pageSize = 1000
  const rows: Row[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await catalogue
      .from("products")
      .select(STYLE_COLUMNS)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as Row[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

function groupRows(rows: Row[]): StyleGroup[] {
  const byKey = new Map<string, Row[]>()
  for (const row of rows) {
    // style_code identifies the garment across storefronts; handle is the
    // fallback identity for the rows the scraper couldn't extract a code from.
    const key = row.style_code?.trim() || row.handle
    const bucket = byKey.get(key)
    if (bucket) bucket.push(row)
    else byKey.set(key, [row])
  }

  const groups: StyleGroup[] = []
  for (const [styleKey, listings] of byKey) {
    // Regional titles carry store prefixes ("Stüssy UK | Basic Tee"), so the
    // shortest spelling across regions is the one closest to the garment's name.
    let title = listings[0].title
    let image: string | null = null
    let publishedAt: string | null = null
    let anyAvailable = false
    const sizes = new Set<string>()
    const availableSizes = new Set<string>()

    for (const row of listings) {
      if (row.title && row.title.length < title.length) title = row.title
      if (!image && row.image_url) image = row.image_url
      if (row.published_at && (!publishedAt || row.published_at > publishedAt)) {
        publishedAt = row.published_at
      }
      if (row.is_available) anyAvailable = true
      for (const s of row.all_sizes_normalised ?? []) sizes.add(s)
      if (row.is_available) {
        for (const s of row.available_sizes_normalised ?? []) availableSizes.add(s)
      }
    }

    groups.push({
      styleKey,
      title,
      category: categoryOf(listings.find((r) => r.product_type)?.product_type ?? ""),
      image,
      publishedAt,
      anyAvailable,
      sizes: [...sizes],
      availableSizes: [...availableSizes],
      listings: listings.map((row) => ({
        id: row.id,
        region: row.region,
        price: row.price,
        currency: row.currency,
        isAvailable: row.is_available,
        availableSizesNormalised: row.available_sizes_normalised ?? [],
        productUrl: row.product_url,
      })),
    })
  }
  return groups
}

/** A group's price for ranking: its cheapest listing, in USD, because raw
 *  regional prices are not comparable (¥28000 is cheaper than £205). */
function minPriceUSD(group: StyleGroup): number {
  let min = Infinity
  for (const l of group.listings) {
    const usd = toUSD(l.price, l.currency)
    if (usd < min) min = usd
  }
  return min
}

/** GET /api/dropradar/styles — the catalogue grouped by garment.
 *  limit/offset paginate over GROUPS, not rows. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const limit = intParam(params.get("limit"), 24, 1, 60)
  const offset = intParam(params.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER)

  let rows: Row[]
  try {
    rows = await fetchAllRows()
  } catch {
    return fail("Failed to fetch products")
  }

  let groups = groupRows(rows)

  const category = params.get("category")
  if (category) groups = groups.filter((g) => g.category === category)

  const size = params.get("size")
  if (size) groups = groups.filter((g) => g.availableSizes.includes(size))

  if (params.get("available") === "true") groups = groups.filter((g) => g.anyAvailable)

  switch (params.get("sort")) {
    case "price_asc":
      groups.sort((a, b) => minPriceUSD(a) - minPriceUSD(b) || a.styleKey.localeCompare(b.styleKey))
      break
    case "price_desc":
      groups.sort((a, b) => minPriceUSD(b) - minPriceUSD(a) || a.styleKey.localeCompare(b.styleKey))
      break
    case "newest":
    default:
      // ISO timestamps compare correctly as strings; nulls sort last so a
      // garment the stores never dated doesn't masquerade as the latest drop.
      groups.sort((a, b) => {
        if (a.publishedAt === b.publishedAt) return a.styleKey.localeCompare(b.styleKey)
        if (!a.publishedAt) return 1
        if (!b.publishedAt) return -1
        return b.publishedAt.localeCompare(a.publishedAt)
      })
  }

  return ok(groups.slice(offset, offset + limit), { total: groups.length, limit, offset })
}
