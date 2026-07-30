package models

import (
	"time"

	"github.com/google/uuid"
)

// Product represents a Stüssy product
type Product struct {
	ID             uuid.UUID `json:"id" db:"id"`
	ShopifyID      int64     `json:"shopify_id" db:"shopify_id"`
	Region         string    `json:"region" db:"region"`
	Handle         string    `json:"handle" db:"handle"`
	Title          string    `json:"title" db:"title"`
	Vendor         string    `json:"vendor" db:"vendor"`
	ProductType    string    `json:"product_type" db:"product_type"`
	Tags           []string  `json:"tags" db:"tags"`
	Price          float64   `json:"price" db:"price"`
	ComparePrice   *float64  `json:"compare_price" db:"compare_price"`
	Currency       string    `json:"currency" db:"currency"`
	IsAvailable    bool      `json:"is_available" db:"is_available"`
	AvailableSizes []string  `json:"available_sizes" db:"available_sizes"`
	TotalVariants  int       `json:"total_variants" db:"total_variants"`
	ImageURL       string    `json:"image_url" db:"image_url"`
	ProductURL     string    `json:"product_url" db:"product_url"`
	FirstSeenAt    time.Time `json:"first_seen_at" db:"first_seen_at"`
	LastSeenAt     time.Time `json:"last_seen_at" db:"last_seen_at"`
	LastHash       string    `json:"last_hash" db:"last_hash"`

	// StyleCode is the leading segment of the Shopify SKU (e.g. "1140364").
	// It identifies the same garment across regional storefronts, which
	// `handle` does not: only ~4% of Australian products share a handle with
	// their US counterpart. Falls back to the handle when a store publishes
	// no structured SKU.
	StyleCode string `json:"style_code" db:"style_code"`
	// Color of this listing, read from the declared Color option axis.
	Color string `json:"color" db:"color"`
	// AllSizes is the full size run, including sold-out sizes; AvailableSizes
	// is only what is currently buyable. The difference is what sold out.
	AllSizes []string `json:"all_sizes" db:"all_sizes"`
	// AllSizesNormalised / AvailableSizesNormalised mirror the two fields above
	// in a vocabulary shared across storefronts ("Size Medium" -> "M"). They are
	// separate columns rather than a rewrite of the raw values so that a bad
	// normalisation rule is recoverable from what the store actually published,
	// and so the original stays auditable. Group and match on these; display the
	// raw ones. See scraper.normaliseSize for the rules and why they exist.
	AllSizesNormalised       []string `json:"all_sizes_normalised" db:"all_sizes_normalised"`
	AvailableSizesNormalised []string `json:"available_sizes_normalised" db:"available_sizes_normalised"`
	// AvailableVariants is how many variants are buyable, giving sell-through
	// (AvailableVariants / TotalVariants) without an Admin API key.
	AvailableVariants int `json:"available_variants" db:"available_variants"`
	// PublishedAt is when the STORE published the product — the real drop
	// timestamp, as opposed to first_seen_at which is when we noticed.
	PublishedAt *time.Time `json:"published_at" db:"published_at"`
}

// Sort options for product listings
const (
	SortNewest    = "newest"     // first_seen_at DESC
	SortPriceAsc  = "price_asc"  // price ASC
	SortPriceDesc = "price_desc" // price DESC
)

type ProductFilter struct {
	Region      string
	Categories  []string // Multiple product_type values
	IsAvailable *bool
	Sort        string // one of the Sort* constants; default recency
	Limit       int
	Offset      int
}
