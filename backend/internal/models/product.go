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
}

type ProductFilter struct {
	Region      string
	Categories  []string // Multiple product_type values
	IsAvailable *bool
	Limit       int
	Offset      int
}
