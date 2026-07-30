/**
 * What each storefront charges to ship where — taken from what the stores
 * themselves publish, not from a guess about carrier zones.
 *
 * Every Stüssy storefront embeds an `internationalMessaging` map in its HTML:
 * for each destination country it serves, the carrier, the price in the
 * store's own currency, and the free-shipping threshold. The five stores were
 * read on 2026-07-30 and this table is that data.
 *
 * The important part is not the prices. It is the destination lists, which are
 * short:
 *
 *   stussy.com      33 countries — Singapore, Hong Kong, Taiwan, Mexico,
 *                   Brazil … but NOT the UK, the EU, Japan or Australia
 *   uk.stussy.com   the United Kingdom, and nowhere else
 *   eu.stussy.com   44 countries across Europe and the Middle East — not the
 *                   UK (which has its own store), the US, Japan or Australia
 *   stussy.jp       Japan only
 *   stussy.com.au   Australia and New Zealand only
 *
 * Stüssy runs a store per region and each one serves its own territory, so
 * most cross-region pairs are not purchasable at any price. Ranking them by
 * estimated landed cost was answering a question nobody can act on: the UK
 * tile on a Singapore comparison quoted a delivered price for an order the UK
 * store will not accept.
 *
 * One genuine import corridor survives among the six destinations modelled
 * here — the US store to Singapore. Every other destination is served by its
 * own domestic store and by nothing else.
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
 * Destination codes match DESTINATIONS in landed-cost.ts. `EU` stands for the
 * eurozone countries the EU store serves; it charges €12 to most of them
 * (Germany, France, Italy, Belgium, Netherlands, Austria, Spain, Poland …),
 * €10 to Denmark and €15–20 to the periphery, so €12 is the modal rate rather
 * than a universal one.
 */
export const SHIPPING: Record<string, Record<string, Corridor>> = {
  us: {
    US: { kind: "ships", cost: 9, currency: "USD", freeOver: 200, freeOverCurrency: "USD", carrier: "Standard" },
    SG: { kind: "ships", cost: 30, currency: "USD", freeOver: 262, freeOverCurrency: "SGD", carrier: "DHL Express" },
    GB: NO,
    EU: NO,
    JP: NO,
    AU: NO,
  },
  uk: {
    GB: { kind: "ships", cost: 5, currency: "GBP", freeOver: 180, freeOverCurrency: "GBP", carrier: "Evri / Royal Mail", ddp: true },
    US: NO,
    EU: NO,
    JP: NO,
    AU: NO,
    SG: NO,
  },
  eu: {
    EU: { kind: "ships", cost: 12, currency: "EUR", freeOver: 200, freeOverCurrency: "EUR", carrier: "DPD / DHL / GLS" },
    GB: NO,
    US: NO,
    JP: NO,
    AU: NO,
    SG: NO,
  },
  jp: {
    JP: { kind: "ships", cost: 550, currency: "JPY", freeOver: 20000, freeOverCurrency: "JPY", carrier: "Yamato" },
    US: NO,
    GB: NO,
    EU: NO,
    AU: NO,
    SG: NO,
  },
  au: {
    AU: { kind: "ships", cost: 12, currency: "AUD", carrier: "Standard" },
    US: NO,
    GB: NO,
    EU: NO,
    JP: NO,
    SG: NO,
  },
  // Dover Street Market Singapore publishes its rates behind a client-rendered
  // FAQ, so none of this could be read the way the Stüssy stores could. Its
  // own market is marked as an estimate and everywhere else as unknown —
  // which is not the same as "does not ship", and is not shown as if it were.
  sg: {
    SG: { kind: "ships", cost: 10, currency: "SGD", carrier: "Local courier (estimated)" },
    US: UNKNOWN,
    GB: UNKNOWN,
    EU: UNKNOWN,
    JP: UNKNOWN,
    AU: UNKNOWN,
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
