/**
 * Currency helpers shared by every price-comparison surface.
 *
 * Regional storefronts quote in their own currency, so raw price numbers are
 * NOT comparable (¥28000 is cheaper than £205). Always rank via toUSD().
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  SGD: "S$",
}

/**
 * Approximate FX rates, used only to rank offers across regions and to show
 * an indicative "≈ $X". These are not checkout prices and drift over time —
 * move to a rates feed if they ever drive a real transaction.
 */
export const FX_TO_USD: Record<string, number> = {
  USD: 1,
  GBP: 1.27,
  EUR: 1.08,
  JPY: 0.0067,
  AUD: 0.65,
  SGD: 0.74,
}

/** Convert a regional price to approximate USD for comparison. */
export function toUSD(price: number, currency: string): number {
  return price * (FX_TO_USD[currency] ?? 1)
}

/**
 * Convert approximate USD back out into a currency, for display.
 *
 * Comparison happens in USD because that is the only unit every storefront can
 * be ranked in. Nobody shopping to Singapore thinks in USD, though, so what
 * gets shown has to come back out.
 */
export function fromUSD(usd: number, currency: string): number {
  return usd / (FX_TO_USD[currency] ?? 1)
}

/**
 * Format an estimate, rounded to whole units. Deliberately not `formatPrice`:
 * these numbers carry a `~`, and centimes on a figure that is an approximation
 * of a duty rate is false precision.
 */
export function formatApprox(value: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return `${symbol}${Math.round(value).toLocaleString()}`
}

/** Format a price in its own currency (JPY has no decimals). */
export function formatPrice(price: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency
  return `${symbol}${price.toFixed(currency === "JPY" ? 0 : 2)}`
}

interface PricedOffer {
  price: number
  currency: string
  is_available?: boolean
}

/**
 * Rank offers cheapest-first by approximate USD value.
 * Returns a new array; each item is annotated with its `usd` value.
 */
export function rankByUSD<T extends PricedOffer>(offers: T[]): (T & { usd: number })[] {
  return offers
    .map((o) => ({ ...o, usd: toUSD(o.price, o.currency) }))
    .sort((a, b) => a.usd - b.usd)
}

/**
 * The offer a shopper should actually buy: cheapest that is in stock,
 * falling back to the cheapest overall when everything is sold out.
 */
export function bestOffer<T extends PricedOffer>(offers: T[]): (T & { usd: number }) | undefined {
  const ranked = rankByUSD(offers)
  return ranked.find((o) => o.is_available !== false) ?? ranked[0]
}
