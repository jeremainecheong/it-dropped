"use client"

import type { Destination } from "@/lib/landed-cost"
import type { Deliverability } from "@/lib/landed-cost"

/**
 * Which regions still have which sizes.
 *
 * The compare grid answers "where is this cheapest". The question someone
 * chasing a particular garment actually has is "my size is gone — who still
 * has it", and answering it meant opening all six regional listings and
 * holding their size runs in your head.
 *
 * Three states, not two. A region that never carried a size is not the same as
 * one that carried it and sold out: the first will not restock it, the second
 * might, and a restock alert is only worth setting on the second. `all_sizes`
 * is the full run the listing was published with and `available_sizes` is what
 * is left, so the distinction is already in the data.
 */

export interface SizeOffer {
  id: string
  region: string
  all_sizes?: string[]
  available_sizes?: string[]
  is_available?: boolean
  deliverability: Deliverability
}

interface Props {
  offers: SizeOffer[]
  destination: Destination
  /** The listing being viewed, highlighted in its column. */
  currentRegion?: string
}

/** Named sizes in the order clothes come in, not the order strings sort in. */
const NAMED = ["OS", "ONE SIZE", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL"]

/**
 * Sort key for a size.
 *
 * Named sizes first, in wearing order; then numeric sizes by value, so waist
 * 28 precedes waist 30 rather than 30 preceding 4 as it would alphabetically;
 * then anything unrecognised, alphabetically, at the end.
 */
function sizeKey(size: string): [number, number, string] {
  const s = size.trim().toUpperCase()
  const named = NAMED.indexOf(s)
  if (named >= 0) return [0, named, s]

  const numeric = Number(s.replace(/[^\d.]/g, ""))
  if (s && Number.isFinite(numeric) && /\d/.test(s)) return [1, numeric, s]

  return [2, 0, s]
}

function compareSizes(a: string, b: string): number {
  const [ka, na, sa] = sizeKey(a)
  const [kb, nb, sb] = sizeKey(b)
  return ka - kb || na - nb || sa.localeCompare(sb)
}

const norm = (s: string) => s.trim().toUpperCase()

export function SizeAvailability({ offers, destination, currentRegion }: Props) {
  // The full size run across every region, so a size only one region carries
  // still gets a row — that row is the interesting one.
  const sizes = Array.from(
    new Set(
      offers.flatMap((o) => (o.all_sizes?.length ? o.all_sizes : (o.available_sizes ?? [])).map(norm))
    )
  ).sort(compareSizes)

  // Sizes that are only recorded as colours or free text turn this into a wall
  // of noise. One region and one size are both degenerate cases of a grid.
  const looksLikeSizes = sizes.some((s) => sizeKey(s)[0] < 2)
  if (offers.length < 2 || sizes.length === 0 || !looksLikeSizes) return null

  const stateFor = (offer: SizeOffer, size: string): "in" | "out" | "absent" => {
    const carried = new Set((offer.all_sizes ?? []).map(norm))
    const have = new Set((offer.available_sizes ?? []).map(norm))
    if (have.has(size)) return "in"
    if (carried.has(size)) return "out"
    return "absent"
  }

  const anyUndeliverable = offers.some((o) => o.deliverability !== "ships")

  return (
    <div className="py-8 border-t border-border">
      <h2 className="label mb-2">Size availability</h2>
      <p className="text-xs text-muted-foreground mb-6">
        Where each size is still in stock. Regions that cannot ship to {destination.name} are
        greyed.
      </p>

      {/* Its own scroll container: a six-region run of columns is wider than a
          phone, and the page body must not scroll sideways because of it. */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[380px] text-[13px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className="text-left font-medium text-muted-foreground pb-2 pr-3 w-16">
                Size
              </th>
              {offers.map((o) => {
                const dim = o.deliverability !== "ships"
                return (
                  <th
                    key={o.id}
                    scope="col"
                    className={`pb-2 px-2 text-center text-[11px] font-semibold uppercase tracking-wide ${
                      dim ? "text-muted-foreground/40" : "text-foreground"
                    }`}
                  >
                    {o.region.toUpperCase()}
                    {o.region === currentRegion && <span className="block text-[9px] font-normal normal-case text-muted-foreground">viewing</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sizes.map((size) => (
              <tr key={size} className="border-t border-border">
                <th scope="row" className="text-left font-medium py-2 pr-3">
                  {size}
                </th>
                {offers.map((o) => {
                  const state = stateFor(o, size)
                  const dim = o.deliverability !== "ships"
                  return (
                    <td key={o.id} className="py-2 px-2 text-center">
                      {/* A dot for in stock, a dash for carried-but-gone, and
                          nothing at all for never carried. The screen-reader
                          text carries the same three states, since a shape
                          alone is not an answer. */}
                      {state === "in" ? (
                        <span
                          className={`inline-block w-2 h-2 rounded-full align-middle ${dim ? "bg-muted-foreground/40" : "bg-green-500"}`}
                          role="img"
                          aria-label={`${size} in stock in ${o.region.toUpperCase()}`}
                        />
                      ) : state === "out" ? (
                        <span className="text-muted-foreground/60" aria-label={`${size} sold out in ${o.region.toUpperCase()}`}>
                          –
                        </span>
                      ) : (
                        <span className="text-muted-foreground/25" aria-label={`${size} not carried in ${o.region.toUpperCase()}`}>
                          ·
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground mt-4">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 align-middle mr-1.5" />
        in stock
        <span className="mx-2 text-muted-foreground/60">–</span>
        sold out
        <span className="mx-2 text-muted-foreground/25">·</span>
        not carried
        {anyUndeliverable && <> · greyed regions do not ship to {destination.name}</>}
      </p>
    </div>
  )
}
