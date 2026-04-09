package models

import (
	"time"

	"github.com/google/uuid"
)

// ScrapeStatus represents the status of a scrape operation
type ScrapeStatus string

const (
	ScrapeStatusRunning ScrapeStatus = "running"
	ScrapeStatusSuccess ScrapeStatus = "success"
	ScrapeStatusFailed  ScrapeStatus = "failed"
)

// ScrapeLog represents a log entry for a scrape operation
type ScrapeLog struct {
	ID            uuid.UUID    `json:"id" db:"id"`
	Region        string       `json:"region" db:"region"`
	StartedAt     time.Time    `json:"started_at" db:"started_at"`
	CompletedAt   *time.Time   `json:"completed_at" db:"completed_at"`
	Status        ScrapeStatus `json:"status" db:"status"`
	ProductsFound int          `json:"products_found" db:"products_found"`
	NewCount      int          `json:"new_count" db:"new_count"`
	RestockCount  int          `json:"restock_count" db:"restock_count"`
	PriceChanges  int          `json:"price_changes" db:"price_changes"`
	ErrorMessage  string       `json:"error_message" db:"error_message"`
	DurationMs    int          `json:"duration_ms" db:"duration_ms"`
}
