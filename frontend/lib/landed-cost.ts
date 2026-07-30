/**
 * Landed-cost estimation for cross-region buying.
 *
 * IMPORTANT — this produces an ESTIMATE, never a quote.
 *
 * Duty and tax are jurisdictional, vary by product category and material,
 * change without notice, and are ultimately assessed by the destination
 * customs authority and collected by the carrier. Treat every number here as
 * "roughly what to expect", label it as such in the UI, and never present it
 * as the price the user will pay.
 *
 * The reason it exists anyway: ranking six storefronts on sticker price alone
 * is actively misleading. A ¥28,000 item that looks cheapest can land dearer
 * than the domestic option once shipping and duty are added. An honest,
 * clearly-labelled estimate beats a confident wrong ranking.
 */

import { formatApprox, fromUSD, toUSD } from "./currency"

export interface Destination {
  code: string
  name: string
  /** Region code whose storefront is domestic for this destination */
  domesticRegion: string
  /** Consumption tax already included in the domestic sticker price */
  domesticTaxIncluded: boolean
  /**
   * Combined duty + import tax as a share of (item + shipping), applied to
   * cross-border orders. Deliberately a single blended figure: pretending to
   * model per-HS-code duty would imply a precision we do not have.
   */
  importRate: number
  /**
   * Order value in USD below which imports are typically not assessed.
   * The US de-minimis exemption was repealed in 2025, so it is 0 there.
   */
  deMinimisUSD: number
  /**
   * What a shopper here pays in. Everything below is computed in USD — the
   * de-minimis thresholds are published in USD and the FX table is anchored
   * there — and converted back out for display. Someone buying to Singapore
   * does not think in dollars.
   */
  currency: string
}

export const DESTINATIONS: Destination[] = [
  { code: "US", name: "United States", domesticRegion: "us", domesticTaxIncluded: false, importRate: 0.20, deMinimisUSD: 0, currency: "USD" },
  { code: "GB", name: "United Kingdom", domesticRegion: "uk", domesticTaxIncluded: true, importRate: 0.28, deMinimisUSD: 0, currency: "GBP" },
  { code: "EU", name: "Europe", domesticRegion: "eu", domesticTaxIncluded: true, importRate: 0.33, deMinimisUSD: 0, currency: "EUR" },
  { code: "JP", name: "Japan", domesticRegion: "jp", domesticTaxIncluded: true, importRate: 0.20, deMinimisUSD: 65, currency: "JPY" },
  { code: "AU", name: "Australia", domesticRegion: "au", domesticTaxIncluded: true, importRate: 0.10, deMinimisUSD: 660, currency: "AUD" },
  { code: "SG", name: "Singapore", domesticRegion: "sg", domesticTaxIncluded: true, importRate: 0.09, deMinimisUSD: 0, currency: "SGD" },
]

export const DEFAULT_DESTINATION = "US"

export function getDestination(code: string): Destination {
  return DESTINATIONS.find((d) => d.code === code) ?? DESTINATIONS[0]
}

/**
 * Typical international shipping, in USD, charged by these storefronts.
 * Flat per source region — carriers price by weight and zone, but a garment
 * sits in a narrow band and a flat figure is honest at this precision.
 */
const SHIPPING_USD: Record<string, number> = {
  us: 25,
  uk: 25,
  eu: 25,
  jp: 35,
  au: 30,
  sg: 30,
}

/** Domestic shipping, in USD. Often free above a threshold. */
const DOMESTIC_SHIPPING_USD = 8
const FREE_DOMESTIC_THRESHOLD_USD = 150

export interface LandedCost {
  /** Sticker price converted to USD */
  itemUSD: number
  shippingUSD: number
  /** Estimated duty + import tax */
  importUSD: number
  /** Total estimated cost delivered, in USD */
  totalUSD: number
  isDomestic: boolean
  /** True when nothing beyond the item price is expected */
  isCleanEstimate: boolean
  notes: string
}

/**
 * Estimate what an item from `sourceRegion` costs delivered to `destination`.
 */
export function estimateLandedCost(
  price: number,
  currency: string,
  sourceRegion: string,
  destination: Destination
): LandedCost {
  const itemUSD = toUSD(price, currency)
  const isDomestic = sourceRegion.toLowerCase() === destination.domesticRegion

  if (isDomestic) {
    const shippingUSD = itemUSD >= FREE_DOMESTIC_THRESHOLD_USD ? 0 : DOMESTIC_SHIPPING_USD
    // Domestic sales tax is either already in the sticker price (VAT markets)
    // or added at checkout and varies by locality (US) — we don't guess it.
    return {
      itemUSD,
      shippingUSD,
      importUSD: 0,
      totalUSD: itemUSD + shippingUSD,
      isDomestic: true,
      isCleanEstimate: true,
      notes: destination.domesticTaxIncluded
        ? "Domestic — tax included in the listed price"
        : "Domestic — sales tax added at checkout, varies by state",
    }
  }

  const shippingUSD = SHIPPING_USD[sourceRegion.toLowerCase()] ?? 30
  const dutiable = itemUSD + shippingUSD

  const belowDeMinimis = destination.deMinimisUSD > 0 && itemUSD < destination.deMinimisUSD
  const importUSD = belowDeMinimis ? 0 : dutiable * destination.importRate

  return {
    itemUSD,
    shippingUSD,
    importUSD,
    totalUSD: itemUSD + shippingUSD + importUSD,
    isDomestic: false,
    isCleanEstimate: false,
    notes: belowDeMinimis
      ? `Import — likely under ${destination.name}'s duty threshold`
      : `Import — includes estimated duty & tax (~${Math.round(destination.importRate * 100)}%)`,
  }
}

export interface RankedOffer<T> {
  offer: T
  landed: LandedCost
}

/**
 * Rank offers by estimated delivered cost rather than sticker price.
 * Sold-out offers are ranked last so "best" is always something buyable.
 */
export function rankByLandedCost<
  T extends { price: number; currency: string; region: string; is_available?: boolean }
>(offers: T[], destination: Destination): RankedOffer<T>[] {
  return offers
    .map((offer) => ({
      offer,
      landed: estimateLandedCost(offer.price, offer.currency, offer.region, destination),
    }))
    .sort((a, b) => {
      const aOut = a.offer.is_available === false
      const bOut = b.offer.is_available === false
      if (aOut !== bOut) return aOut ? 1 : -1
      return a.landed.totalUSD - b.landed.totalUSD
    })
}

/**
 * Collapse a garment's listings to one offer per region.
 *
 * style_code identifies a GARMENT, not a listing, so a single cap legitimately
 * returns ~50 rows across six regions — one per colourway, several per region.
 * The compare grid answers "where is this cheapest", so it wants six tiles, not
 * fifty. Within a region the pick is: same colour as the listing being viewed,
 * then in stock, then cheapest delivered.
 */
export function bestOfferPerRegion<
  T extends {
    price: number
    currency: string
    region: string
    is_available?: boolean
    color?: string
  },
>(offers: T[], destination: Destination, preferColor?: string): RankedOffer<T>[] {
  const wanted = preferColor?.trim().toLowerCase()

  const ranked = rankByLandedCost(offers, destination).sort((a, b) => {
    if (wanted) {
      const aMatch = a.offer.color?.trim().toLowerCase() === wanted
      const bMatch = b.offer.color?.trim().toLowerCase() === wanted
      if (aMatch !== bMatch) return aMatch ? -1 : 1
    }
    const aOut = a.offer.is_available === false
    const bOut = b.offer.is_available === false
    if (aOut !== bOut) return aOut ? 1 : -1
    return a.landed.totalUSD - b.landed.totalUSD
  })

  const bestByRegion = new Map<string, RankedOffer<T>>()
  for (const entry of ranked) {
    if (!bestByRegion.has(entry.offer.region)) bestByRegion.set(entry.offer.region, entry)
  }

  // Re-sort the survivors by cost, since the colour preference above is only
  // meant to decide WHICH listing represents a region, not their ordering.
  return [...bestByRegion.values()].sort((a, b) => {
    const aOut = a.offer.is_available === false
    const bOut = b.offer.is_available === false
    if (aOut !== bOut) return aOut ? 1 : -1
    return a.landed.totalUSD - b.landed.totalUSD
  })
}

/** Format a single USD figure in the destination's currency. */
export function formatLanded(usd: number, destination: Destination): string {
  return formatApprox(fromUSD(usd, destination.currency), destination.currency)
}

/** A landed cost as it should be displayed: one currency, whole units. */
export interface DisplayCost {
  item: number
  shipping: number
  duty: number
  total: number
  currency: string
}

/**
 * Convert a landed cost into displayable figures in the destination's currency.
 *
 * Two rules, both learned from the same bug report.
 *
 * One currency. The breakdown used to show the item in the store's currency
 * and everything else in USD, so a column read `€50 + ~$25 + ~$7 = ~$86`.
 * That is arithmetically correct — the €50 is $54 by the time it reaches the
 * total — and it reads as broken, because three of the four numbers are in
 * units the reader was not told about. And none of them were in the currency
 * the shopper actually picked.
 *
 * The total is the sum of the rounded rows, not the rounded sum. Rounding each
 * line independently leaves the column off by one often enough to notice, and
 * a breakdown that visibly disagrees with its own total is the same defect
 * wearing a different hat. At an estimate's precision the difference is noise;
 * being internally consistent is not.
 *
 * Ranking still uses the unrounded `totalUSD` — this is presentation only.
 */
export function toDisplayCost(landed: LandedCost, destination: Destination): DisplayCost {
  const inDest = (usd: number) => Math.round(fromUSD(usd, destination.currency))

  const item = inDest(landed.itemUSD)
  const shipping = inDest(landed.shippingUSD)
  const duty = inDest(landed.importUSD)

  return { item, shipping, duty, total: item + shipping + duty, currency: destination.currency }
}

/** Format one figure from a DisplayCost. */
export function formatDisplay(value: number, cost: DisplayCost): string {
  return formatApprox(value, cost.currency)
}
