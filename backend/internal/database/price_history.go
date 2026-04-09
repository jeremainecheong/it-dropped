package database

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PriceHistoryEntry represents a single price history record
type PriceHistoryEntry struct {
	ID             uuid.UUID `json:"id"`
	ProductID      uuid.UUID `json:"product_id"`
	Price          float64   `json:"price"`
	ComparePrice   *float64  `json:"compare_price"`
	IsAvailable    bool      `json:"is_available"`
	AvailableSizes []string  `json:"available_sizes"`
	RecordedAt     time.Time `json:"recorded_at"`
}

// GetPriceHistory retrieves price history for a product
func (c *Client) GetPriceHistory(ctx context.Context, productID string, limit int) ([]PriceHistoryEntry, error) {
	query := `
		SELECT id, product_id, price, compare_price, is_available, available_sizes, recorded_at
		FROM price_history
		WHERE product_id = $1
		ORDER BY recorded_at DESC
		LIMIT $2`

	rows, err := c.pool.Query(ctx, query, productID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query price history: %w", err)
	}
	defer rows.Close()

	var history []PriceHistoryEntry
	for rows.Next() {
		var entry PriceHistoryEntry
		if err := rows.Scan(
			&entry.ID, &entry.ProductID, &entry.Price, &entry.ComparePrice,
			&entry.IsAvailable, &entry.AvailableSizes, &entry.RecordedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan price history: %w", err)
		}
		history = append(history, entry)
	}

	return history, nil
}
