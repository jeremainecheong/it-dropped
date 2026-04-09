package database

import (
	"context"
	"fmt"

	"github.com/yourusername/dropradar/internal/models"
)

// GetRegionStats returns aggregated stats for each region
func (c *Client) GetRegionStats(ctx context.Context) ([]models.RegionStats, error) {
	// This query aggregates stats per region
	// Active Drops: Products detected in last 24h (first_seen_at > now - 24h)
	// Total Items: Count of all products
	// Top Category: Most frequent product_type
	// Note: Providing Top Category in a single aggregated query is complex in standard SQL without subqueries/windows
	// For simplicity and performance, we'll do this in code or multiple queries if needed.
	// Let's try a robust single query approach using window functions.

	query := `
		WITH RegionCounts AS (
			SELECT region, COUNT(*) as total_items
			FROM products
			GROUP BY region
		),
		ActiveDrops AS (
			SELECT region, COUNT(*) as active_count
			FROM products
			WHERE first_seen_at > NOW() - INTERVAL '24 hours'
			GROUP BY region
		),
		CategoryRanks AS (
			SELECT region, product_type, COUNT(*) as cat_count,
			ROW_NUMBER() OVER (PARTITION BY region ORDER BY COUNT(*) DESC) as rn
			FROM products
			WHERE product_type != ''
			GROUP BY region, product_type
		)
		SELECT 
			rc.region,
			COALESCE(ad.active_count, 0) as active_drops_24h,
			COALESCE(rc.total_items, 0) as total_tracked_items,
			COALESCE(cr.product_type, 'N/A') as top_category
		FROM RegionCounts rc
		LEFT JOIN ActiveDrops ad ON rc.region = ad.region
		LEFT JOIN CategoryRanks cr ON rc.region = cr.region AND cr.rn = 1
		ORDER BY rc.region
	`

	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		fmt.Printf("SQL Error: %v\n", err) // Add direct printing for debug
		return nil, fmt.Errorf("failed to query region stats: %w", err)
	}
	defer rows.Close()

	var stats []models.RegionStats
	for rows.Next() {
		var s models.RegionStats
		if err := rows.Scan(&s.Region, &s.ActiveDrops24h, &s.TotalTrackedItems, &s.TopCategory); err != nil {
			fmt.Printf("Scan Error: %v\n", err) // Add direct printing for debug
			return nil, fmt.Errorf("failed to scan stats: %w", err)
		}
		stats = append(stats, s)
	}

	return stats, nil
}
