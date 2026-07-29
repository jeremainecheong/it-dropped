import { ImageResponse } from "next/og"
import { getProduct, getProductsByHandle, formatPriceServer } from "@/lib/api"

export const runtime = "nodejs"
export const revalidate = 3600
export const alt = "It Dropped — Stüssy price tracker"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const FX: Record<string, number> = {
  USD: 1, GBP: 1.27, EUR: 1.08, JPY: 0.0067, AUD: 0.65, SGD: 0.74,
}

// Satori notes, both learned the hard way:
//  1. Any element with more than one child needs an explicit display value.
//  2. Glyphs outside the bundled font trigger a Google Fonts fetch that can
//     fail; stick to Latin-1 (no "≈", no em-dash).

export default async function Image({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id)

  if (!product) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#ffffff", color: "#1d1d1f",
            fontSize: 64, fontWeight: 600,
          }}
        >
          It Dropped
        </div>
      ),
      size
    )
  }

  const siblings = (await getProductsByHandle(product.handle)) || [product]
  const priced = siblings
    .map((p) => ({ ...p, usd: p.price * (FX[p.currency] ?? 1) }))
    .sort((a, b) => a.usd - b.usd)

  const cheapest = priced[0]
  const dearest = priced[priced.length - 1]
  const spread = Math.round(dearest.usd - cheapest.usd)
  const title = product.title.length > 46 ? product.title.slice(0, 46) + "..." : product.title

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "#ffffff", color: "#1d1d1f", padding: 72,
          fontFamily: "sans-serif", justifyContent: "space-between",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 22, height: 22, borderRadius: 11, background: "#e11d2e" }} />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600 }}>It Dropped</div>
        </div>

        {/* Product + prices */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, marginBottom: 28 }}>
            {title}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 48 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 20, color: "#6e6e73", marginBottom: 6 }}>
                Cheapest in {cheapest.region.toUpperCase()}
              </div>
              <div style={{ display: "flex", fontSize: 46, fontWeight: 700 }}>
                {formatPriceServer(cheapest.price, cheapest.currency)}
              </div>
            </div>

            {spread > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 20, color: "#6e6e73", marginBottom: 6 }}>
                  Dearest in {dearest.region.toUpperCase()}
                </div>
                <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: "#6e6e73" }}>
                  {formatPriceServer(dearest.price, dearest.currency)}
                </div>
              </div>
            ) : null}

            {spread > 0 ? (
              <div
                style={{
                  display: "flex", background: "#e11d2e", color: "#ffffff",
                  padding: "10px 24px", borderRadius: 999, fontSize: 26, fontWeight: 600,
                }}
              >
                ${spread} gap
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", fontSize: 22, color: "#6e6e73" }}>
          Tracked in {siblings.length} {siblings.length === 1 ? "region" : "regions"} / US / UK / EU / JP / AU / SG
        </div>
      </div>
    ),
    size
  )
}
