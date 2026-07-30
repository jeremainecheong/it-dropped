import type { Metadata } from "next"
import { getProduct, getProductsByHandle, formatPriceServer, SITE_URL } from "@/lib/api"
import ProductDetail from "./product-client"

// Product data changes with the scrape cycle; revalidate rather than
// rebuilding, so crawlers get fresh pages without hammering the API.
export const revalidate = 300
export const dynamicParams = true

interface Props {
  params: { id: string }
}

/**
 * Real per-product metadata. These pages used to sit behind an auth guard and
 * render nothing for a crawler; now each tracked item is an indexable page
 * that answers a genuine long-tail query ("<product> price Japan vs US").
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id)

  if (!product) {
    return {
      title: "Product not found — It Dropped",
      robots: { index: false, follow: true },
    }
  }

  const price = formatPriceServer(product.price, product.currency)
  const region = product.region.toUpperCase()
  const title = `${product.title} — ${price} in ${region}`
  const description =
    `Track ${product.title} across six Stüssy storefronts. ` +
    `Currently ${price} in ${region}${product.is_available ? "" : " (sold out)"}. ` +
    `Compare prices in the US, UK, EU, Japan, Australia and Singapore, with price history and restock alerts.`

  const canonical = `${SITE_URL}/product/${product.id}`
  const ogImage = `${SITE_URL}/product/${product.id}/opengraph-image`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "It Dropped",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: product.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct(params.id)
  const siblings = product ? await getProductsByHandle(product.handle) : null

  // Structured data so search engines can render price and availability
  // directly. Every claim here comes from the tracker's own observation.
  const jsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: product.image_url ? [product.image_url] : undefined,
        brand: { "@type": "Brand", name: product.vendor || "Stüssy" },
        category: product.product_type || undefined,
        color: product.color || undefined,
        sku: product.style_code || product.handle,
        offers: (siblings && siblings.length ? siblings : [product]).map((p) => ({
          "@type": "Offer",
          url: p.product_url,
          price: p.price,
          priceCurrency: p.currency,
          availability: p.is_available
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          areaServed: p.region.toUpperCase(),
        })),
      }
    : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {/* Both were read above for the JSON-LD. Handing them down removes the
          browser's two-step fetch — product, then siblings keyed by the handle
          it had to fetch the product to learn. */}
      <ProductDetail initialProduct={product} initialSiblings={siblings ?? []} />
    </>
  )
}
