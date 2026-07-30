/**
 * The category vocabulary: six buckets over the storefronts' raw
 * product_type values. Shop chips, drops and category watches all speak in
 * these buckets, so a garment must land in the same one everywhere.
 *
 * The type lists are the flattened CATEGORY_GROUPS from app/shop/page.tsx —
 * the storefronts disagree on spelling ("Accessories Bucket Hat",
 * "Accessories - Bucket Hat", "HATS" are one thing), and this is the one
 * place those spellings are reconciled.
 *
 * backend/internal/database mirrors this vocabulary for category watch
 * matching. A product_type added or moved here must change there in the same
 * commit, or watches will fire on a different set of garments than the chips
 * show.
 */

export interface Category {
  /** Stable identifier — stored in category_watches.category and URLs. */
  key: string
  label: string
  productTypes: string[]
}

export const CATEGORIES: Category[] = [
  {
    key: "tops",
    label: "Tops",
    productTypes: [
      "Mens Short Sleeve T-Shirt", "Mens Long Sleeve T-Shirt", "TEES",
      "Mens Short Sleeve Shirt", "Mens Long Sleeve Shirt", "SHIRTS",
      "Mens Short Sleeve Knit", "Mens Long Sleeve Knit", "KNIT TOPS",
      "Mens Long Sleeve Sweater", "SWEATERS",
      "Mens Long Sleeve Sweatshirt", "HOODIE",
    ],
  },
  {
    key: "bottoms",
    label: "Bottoms",
    productTypes: [
      "Mens Pant", "Mens Regular Pant", "PANTS", "Jeans",
      "Mens Short", "Mens Swim Bottom",
      "Mens Sweatpant",
    ],
  },
  {
    key: "outerwear",
    label: "Outerwear",
    productTypes: [
      "Mens Long Sleeve Outerwear", "JACKETS",
      "Mens Sleeveless Outerwear", "VESTS",
    ],
  },
  {
    key: "headwear",
    label: "Headwear",
    productTypes: [
      "Accessories Ball Cap",
      "Accessories Beanie", "Accessories Not Applicable Beanie",
      "Accessories Bucket Hat", "Accessories - Bucket Hat", "HATS",
    ],
  },
  {
    key: "accessories",
    label: "Accessories",
    productTypes: [
      "Accessories Backpack", "Accessories Shoulder Bag", "Accessories Side Bag", "Accessories Tote Bag", "BACKPACKS",
      "Accessories Belt", "Accessories Belts", "Accessories Not Applicable Belts", "BELTS",
      "Accessories Wallet",
      "Accessories Sunglasses", "EYEWEAR",
      "Accessories Bottle", "Accessories Brief", "Accessories Key Chain", "Accessories Necktie",
      "Accessories Novelty Home", "Accessories Socks", "Accessories Not Applicable Key Chain",
    ],
  },
  {
    key: "footwear",
    label: "Footwear",
    productTypes: [
      "Mens Shoes", "SNEAKERS",
    ],
  },
]

// Lookup is case-insensitive because the same type arrives as "TEES" from one
// storefront and could plausibly arrive as "Tees" after a Shopify migration.
const TYPE_TO_KEY = new Map<string, string>()
for (const cat of CATEGORIES) {
  for (const t of cat.productTypes) {
    TYPE_TO_KEY.set(t.trim().toLowerCase(), cat.key)
  }
}

/**
 * The bucket key for a raw product_type, or null for types outside the
 * vocabulary (gift cards and the like) — callers should treat null as
 * "uncategorised", not an error.
 */
export function categoryOf(productType: string): string | null {
  if (!productType) return null
  return TYPE_TO_KEY.get(productType.trim().toLowerCase()) ?? null
}

/** The full Category for a bucket key ("tops"), or its label ("Tops"). */
export function getCategory(keyOrLabel: string): Category | null {
  const needle = keyOrLabel.trim().toLowerCase()
  return CATEGORIES.find((c) => c.key === needle || c.label.toLowerCase() === needle) ?? null
}
