/**
 * What each storefront charges to ship where — taken from what the stores
 * themselves publish, not from a guess about carrier zones.
 *
 * Every Stüssy storefront embeds an `internationalMessaging` map in its HTML:
 * for each destination country it serves, the carrier, the price in the
 * store's own currency, and the free-shipping threshold. The five stores were
 * read on 2026-07-30 and this table is generated from that data.
 *
 * The destination lists are as informative as the prices, and they are short:
 *
 *   stussy.com      33 countries — Singapore, Hong Kong, Malaysia, Thailand,
 *                   the Philippines, Indonesia, Mexico, India, South Africa,
 *                   Brazil … but NOT the UK, the EU, Japan or Australia
 *   uk.stussy.com   the United Kingdom, and nowhere else
 *   eu.stussy.com   44 countries across Europe and the Middle East, plus
 *                   India and South Africa delivered-duty-paid — not the UK
 *                   (which has its own store), the US, Japan or Australia
 *   stussy.jp       Japan only
 *   stussy.com.au   Australia and New Zealand only
 *
 * Stüssy runs a store per region and each serves its own territory, so most
 * cross-region pairs cannot be bought at any price. Ranking them by estimated
 * landed cost answered a question nobody can act on. Where two stores really
 * do serve the same country — India and South Africa are served by both the US
 * and the EU store — the comparison is a real one.
 *
 * Destinations are limited to those whose currency the ECB quotes, since a
 * delivered cost has to be converted into something to be shown. That excludes
 * Taiwan and Vietnam, which the US store does serve; they are absent for want
 * of an exchange rate, not for want of shipping.
 *
 * Dover Street Market Singapore publishes nothing readable, so its rates were
 * read out of its own checkout instead — see the `sg` block. Every figure in
 * this file is now the store's, and `unknown` no longer occurs.
 */

export type Corridor =
  /** The store publishes a price for this destination. */
  | {
      kind: "ships"
      /** Cost in `currency` — the store's own, as published. */
      cost: number
      currency: string
      /** Order value above which the store ships free, in `freeOverCurrency`. */
      freeOver?: number
      freeOverCurrency?: string
      carrier?: string
      /** The store collects duty and import tax at checkout, so there is
       *  nothing further to pay on delivery. Several stores say so outright. */
      ddp?: boolean
    }
  /** The store publishes a destination list and this is not on it. */
  | { kind: "no-service" }
  /** No destination list could be established for this store. Not the same as
   *  "does not ship there", and must not be presented as if it were. */
  | { kind: "unknown" }

const NO: Corridor = { kind: "no-service" }
// No entry uses this any more — every corridor below was established one
// way or another. It remains the fallback for a region or destination that is
// not in the table at all, where "we did not look" is the honest answer.
const UNKNOWN: Corridor = { kind: "unknown" }

/**
 * source region → destination code → corridor.
 *
 * `EU` stands for the eurozone countries the EU store serves, at Germany's
 * rate: €12 is the modal figure across them, with €10 to Denmark and €15–20 to
 * the periphery.
 */
export const SHIPPING: Record<string, Record<string, Corridor>> = {
  us: {
    US: { kind: "ships", cost: 9, currency: "USD", freeOver: 200, freeOverCurrency: "USD", carrier: "Standard" },
    GB: NO,
    EU: NO,
    JP: NO,
    AU: NO,
    SG: { kind: "ships", cost: 30, currency: "USD", freeOver: 262, freeOverCurrency: "SGD", carrier: "DHL Express" },
    HK: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
    MY: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
    TH: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
    PH: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
    ID: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
    MX: { kind: "ships", cost: 30, currency: "USD", freeOver: 3902, freeOverCurrency: "MXN", carrier: "DHL Express" },
    IN: { kind: "ships", cost: 20, currency: "USD", carrier: "DHL Express" },
    ZA: { kind: "ships", cost: 25, currency: "USD", carrier: "DHL Express" },
    BR: { kind: "ships", cost: 30, currency: "USD", carrier: "DHL Express" },
  },
  uk: {
    US: NO,
    GB: { kind: "ships", cost: 5, currency: "GBP", freeOver: 180, freeOverCurrency: "GBP", carrier: "Evri or Royal Mail Standard" },
    EU: NO,
    JP: NO,
    AU: NO,
    SG: NO,
    HK: NO,
    MY: NO,
    TH: NO,
    PH: NO,
    ID: NO,
    MX: NO,
    IN: NO,
    ZA: NO,
    BR: NO,
  },
  eu: {
    US: NO,
    GB: NO,
    EU: { kind: "ships", cost: 12, currency: "EUR", freeOver: 200, freeOverCurrency: "EUR", carrier: "DHL PACKET" },
    JP: NO,
    AU: NO,
    SG: NO,
    HK: NO,
    MY: NO,
    TH: NO,
    PH: NO,
    ID: NO,
    MX: NO,
    IN: { kind: "ships", cost: 25, currency: "EUR", carrier: "DHL Express", ddp: true },
    ZA: { kind: "ships", cost: 25, currency: "EUR", carrier: "DHL Express", ddp: true },
    BR: NO,
  },
  jp: {
    US: NO,
    GB: NO,
    EU: NO,
    JP: { kind: "ships", cost: 550, currency: "JPY", freeOver: 20000, freeOverCurrency: "JPY", carrier: "Yamato" },
    AU: NO,
    SG: NO,
    HK: NO,
    MY: NO,
    TH: NO,
    PH: NO,
    ID: NO,
    MX: NO,
    IN: NO,
    ZA: NO,
    BR: NO,
  },
  au: {
    US: NO,
    GB: NO,
    EU: NO,
    JP: NO,
    AU: { kind: "ships", cost: 12, currency: "AUD", carrier: "Standard" },
    SG: NO,
    HK: NO,
    MY: NO,
    TH: NO,
    PH: NO,
    ID: NO,
    MX: NO,
    IN: NO,
    ZA: NO,
    BR: NO,
  },
  // Dover Street Market Singapore does not publish a rate card anywhere
  // readable — its FAQ is client-rendered and its shipping page is a stub. So
  // these came from its checkout instead: /cart/shipping_rates.json, the same
  // endpoint the store's own basket calls, asked once per destination on
  // 2026-07-30. Nothing here is estimated.
  //
  // Two things that guessing had got wrong. Domestic shipping is free and
  // unconditional, not the S$10 previously assumed — verified on a S$279
  // basket and again on a S$39 one, so there is no threshold. And DSM is a
  // real second source for three countries: it quotes DHL Express Worldwide to
  // Malaysia, Thailand and Indonesia, which had been marked unknown.
  //
  // Everywhere else returned no rates at all, which is Shopify's way of saying
  // the destination is not served.
  sg: {
    SG: { kind: "ships", cost: 0, currency: "SGD", carrier: "Free SG Shipping" },
    MY: { kind: "ships", cost: 28.45, currency: "SGD", carrier: "DHL Express Worldwide" },
    TH: { kind: "ships", cost: 34.39, currency: "SGD", carrier: "DHL Express Worldwide" },
    ID: { kind: "ships", cost: 34.39, currency: "SGD", carrier: "DHL Express Worldwide" },
    US: NO,
    GB: NO,
    EU: NO,
    JP: NO,
    AU: NO,
    HK: NO,
    PH: NO,
    MX: NO,
    IN: NO,
    ZA: NO,
    BR: NO,
  },
}

/** The corridor from a store to a destination. Unknown when unlisted. */
export function corridor(sourceRegion: string, destinationCode: string): Corridor {
  return SHIPPING[sourceRegion.toLowerCase()]?.[destinationCode] ?? UNKNOWN
}

/** True when this store's own published rates are estimates rather than read
 *  from the storefront. Surfaced so the UI can say so. */
export function isEstimatedCorridor(c: Corridor): boolean {
  return c.kind === "ships" && (c.carrier?.includes("estimated") ?? false)
}
