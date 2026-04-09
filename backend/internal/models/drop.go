package models

import (
	"time"

	"github.com/google/uuid"
)

// ChangeType represents the type of product change
type ChangeType string

const (
	ChangeTypeNew           ChangeType = "new"
	ChangeTypeRestock       ChangeType = "restock"
	ChangeTypePriceDrop     ChangeType = "price_drop"
	ChangeTypePriceIncrease ChangeType = "price_increase"
	ChangeTypeSizeRestock   ChangeType = "size_restock"
)

// Drop represents a detected product change
type Drop struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	ProductID      *uuid.UUID `json:"product_id" db:"product_id"`
	ShopifyID      int64      `json:"shopify_id" db:"shopify_id"`
	Region         string     `json:"region" db:"region"`
	ChangeType     ChangeType `json:"change_type" db:"change_type"`
	Title          string     `json:"title" db:"title"`
	Price          float64    `json:"price" db:"price"`
	Currency       string     `json:"currency" db:"currency"`
	ImageURL       string     `json:"image_url" db:"image_url"`
	ProductURL     string     `json:"product_url" db:"product_url"`
	OldValue       string     `json:"old_value" db:"old_value"`
	NewValue       string     `json:"new_value" db:"new_value"`
	AvailableSizes []string   `json:"available_sizes" db:"available_sizes"`
	DetectedAt     time.Time  `json:"detected_at" db:"detected_at"`
	Notified       bool       `json:"notified" db:"notified"`
	NotifiedAt     *time.Time `json:"notified_at" db:"notified_at"`
}

// DropFilter for querying drops
type DropFilter struct {
	Region     string
	ChangeType ChangeType
	Notified   *bool
	Limit      int
	Offset     int
}
