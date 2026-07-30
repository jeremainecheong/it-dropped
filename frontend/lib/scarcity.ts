/**
 * How much of a listing's size run is left.
 *
 * The scraper already counts both `total_variants` and `available_variants`
 * per listing, and until now the pair was only used to decide whether a
 * product was in stock at all. The difference between "in stock" and "one size
 * left" is most of the decision when you are chasing a specific garment.
 */

export interface Scarcity {
  available: number
  total: number
  /** Worth drawing attention to — see LOW_STOCK_FRACTION. */
  isLow: boolean
  label: string
}

/**
 * Below this share of the size run remaining, a listing counts as running out.
 *
 * A third is deliberately conservative. Labelling five of seven sizes as
 * "running out" trains people to ignore the label, and a badge everything
 * carries says nothing.
 */
const LOW_STOCK_FRACTION = 1 / 3

export function scarcity(available: number | undefined, total: number | undefined): Scarcity | null {
  // A listing whose variant counts were never populated must not render as
  // "0 of 0 left" — no data is not the same as no stock.
  if (!total || total <= 0 || available == null || available < 0) return null
  if (available === 0) return { available: 0, total, isLow: false, label: "Sold out" }

  // One-size items have nothing to run out of in the sense meant here: a
  // single-variant listing is either available or it is not, and "1 of 1 left"
  // reads as scarcity where there is none.
  if (total === 1) return null

  return {
    available,
    total,
    isLow: available / total <= LOW_STOCK_FRACTION,
    label: available === 1 ? "1 size left" : `${available} of ${total} sizes left`,
  }
}
