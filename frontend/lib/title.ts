/**
 * Listing titles, made displayable.
 *
 * The six storefronts name the same garment three ways: the US store shouts
 * ("SPORT SHORT"), DSM Singapore prefixes and suffixes ("Stüssy - Men's Sport
 * Short - (Orange)"), and the rest sit in between. Rendered raw at card size
 * these truncate into noise — "Stüssy -…" tells you nothing at all.
 *
 * cleanTitle strips the redundant brand prefix (the whole app is one brand)
 * and pulls a trailing "- (Colour)" out as its own field, so a card can show
 * "Men's Sport Short" with a quiet "Orange" beside it instead of losing both
 * to an ellipsis.
 */
export interface DisplayTitle {
  name: string
  colour: string | null
}

const BRAND_PREFIX = /^st[uü]ssy\s*[-–—:]\s*/i
const COLOUR_SUFFIX = /\s*[-–—]\s*\(([^)]+)\)\s*$/

export function cleanTitle(raw: string): DisplayTitle {
  let name = raw.trim().replace(BRAND_PREFIX, "")
  let colour: string | null = null

  const m = name.match(COLOUR_SUFFIX)
  if (m) {
    colour = m[1].trim()
    name = name.replace(COLOUR_SUFFIX, "")
  }

  // The US store publishes in full caps. SHOUTED CARD GRIDS read as pressure,
  // not information — fold anything fully upper-case to title case. Mixed-case
  // titles pass through untouched, so "9FORTY" (a real product name) survives
  // when any store spells it properly.
  if (name === name.toUpperCase() && /[A-Z]/.test(name)) {
    name = name
      .toLowerCase()
      .replace(/(^|\s|\/|-)([a-z])/g, (s) => s.toUpperCase())
  }

  return { name: name || raw, colour }
}
