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
  // Dover Street Market Singapore publishes its rates behind a client-rendered
  // FAQ, so none of this could be read the way the Stüssy stores could. Its own
  // market is marked as an estimate and everywhere else as unknown — which is
  // not the same as "does not ship", and is not shown as if it were.
  sg: {
    SG: { kind: "ships", cost: 10, currency: "SGD", carrier: "Local courier (estimated)" },
    US: UNKNOWN,
    GB: UNKNOWN,
    EU: UNKNOWN,
    JP: UNKNOWN,
    AU: UNKNOWN,
    HK: UNKNOWN,
    MY: UNKNOWN,
    TH: UNKNOWN,
    PH: UNKNOWN,
    ID: UNKNOWN,
    MX: UNKNOWN,
    IN: UNKNOWN,
    ZA: UNKNOWN,
    BR: UNKNOWN,
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
