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
  HKD: "HK$",
  MYR: "RM",
  THB: "฿",
  PHP: "₱",
  IDR: "Rp",
  MXN: "MX$",
  INR: "₹",
  ZAR: "R",
  BRL: "R$",
}

/** USD per one unit of the currency. */
export type FxRates = Record<string, number>

/**
 * Rates to fall back on when the feed is unreachable.
 *
 * These were the hardcoded table, and the reason they are now only a fallback
 * is that they had drifted: against the ECB's rates on 2026-07-30 the euro was
 * 5.7% low, sterling 4.9% low and the yen 8.7% high. On a €215 jacket that is
 * about $17 of error before shipping is even added — larger than the duty line
 * the estimate agonises over. Live rates come from /api/dropradar/fx.
 */
export const FALLBACK_FX_TO_USD: FxRates = {
  USD: 1,
  GBP: 1.3289,
  EUR: 1.13801,
  JPY: 0.00610948,
  AUD: 0.694011,
  SGD: 0.773635,
  HKD: 0.127512,
  MYR: 0.244529,
  THB: 0.029824,
  PHP: 0.0162856,
  IDR: 0.0000553342,
  MXN: 0.057223,
  INR: 0.0104548,
  ZAR: 0.0597018,
  BRL: 0.195305,
}

/**
 * Rates in force for a render.
 *
 * Passed explicitly rather than read from module state, so a component that
 * receives live rates re-renders with them: a mutable module-level table
 * updates silently and leaves whatever already rendered showing the fallback.
 * Omitted, the fallback is used, which keeps every non-React caller working.
 */
export function toUSD(price: number, currency: string, rates: FxRates = FALLBACK_FX_TO_USD): number {
  return price * (rates[currency] ?? FALLBACK_FX_TO_USD[currency] ?? 1)
}

/**
 * Convert USD back out into a currency, for display.
 *
 * Comparison happens in USD because that is the only unit every storefront can
 * be ranked in. Nobody shopping to Singapore thinks in USD, though, so what
 * gets shown has to come back out.
 */
export function fromUSD(usd: number, currency: string, rates: FxRates = FALLBACK_FX_TO_USD): number {
  return usd / (rates[currency] ?? FALLBACK_FX_TO_USD[currency] ?? 1)
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
