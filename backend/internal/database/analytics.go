package database

import (
	"context"
	"fmt"

	"github.com/yourusername/dropradar/internal/models"
)

// GetDropActivity returns per-day counts of drops by kind for the last N days.
// This replaces the frontend's Math.random() chart generators — the dashboard
// claimed "market intelligence, updated in real time" while plotting noise.
func (c *Client) GetDropActivity(ctx context.Context, days int) ([]models.DropActivityPoint, error) {
	if days <= 0 || days > 90 {
		days = 7
	}

	rows, err := c.pool.Query(ctx, fmt.Sprintf(`
		SELECT d::date AS day,
		       COUNT(*) FILTER (WHERE dr.change_type = 'new')                              AS drops,
		       COUNT(*) FILTER (WHERE dr.change_type IN ('restock','size_restock'))        AS restocks,
		       COUNT(*) FILTER (WHERE dr.change_type IN ('sold_out','size_sold_out'))      AS sold_out,
		       COUNT(*) FILTER (WHERE dr.change_type = 'price_drop')                       AS price_drops
		FROM generate_series(CURRENT_DATE - INTERVAL '%d days', CURRENT_DATE, '1 day') d
		LEFT JOIN drops dr ON dr.detected_at::date = d::date
		GROUP BY d
		ORDER BY d`, days-1))
	if err != nil {
		return nil, fmt.Errorf("failed to query drop activity: %w", err)
	}
	defer rows.Close()

	var out []models.DropActivityPoint
	for rows.Next() {
		var p models.DropActivityPoint
		if err := rows.Scan(&p.Day, &p.Drops, &p.Restocks, &p.SoldOut, &p.PriceDrops); err != nil {
			return nil, fmt.Errorf("failed to scan drop activity: %w", err)
		}
		out = append(out, p)
	}
	return out, nil
}

// GetPriceBands returns the daily min/avg/max of observed prices, normalised
// to approximate USD so regions are comparable on one axis.
func (c *Client) GetPriceBands(ctx context.Context, days int) ([]models.PriceBandPoint, error) {
	if days <= 0 || days > 365 {
		days = 30
	}

	rows, err := c.pool.Query(ctx, fmt.Sprintf(`
		SELECT d::date AS day,
		       COALESCE(ROUND(AVG(usd)::numeric, 2), 0),
		       COALESCE(ROUND(MIN(usd)::numeric, 2), 0),
		       COALESCE(ROUND(MAX(usd)::numeric, 2), 0),
		       COUNT(ph.id)
		FROM generate_series(CURRENT_DATE - INTERVAL '%d days', CURRENT_DATE, '1 day') d
		LEFT JOIN LATERAL (
			SELECT ph.id, ph.price * CASE ph.currency
				WHEN 'USD' THEN 1.0 WHEN 'GBP' THEN 1.27 WHEN 'EUR' THEN 1.08
				WHEN 'JPY' THEN 0.0067 WHEN 'AUD' THEN 0.65 WHEN 'SGD' THEN 0.74
				ELSE 1.0 END AS usd
			FROM price_history ph
			WHERE ph.recorded_at::date = d::date
		) ph ON TRUE
		GROUP BY d
		ORDER BY d`, days-1))
	if err != nil {
		return nil, fmt.Errorf("failed to query price bands: %w", err)
	}
	defer rows.Close()

	var out []models.PriceBandPoint
	for rows.Next() {
		var p models.PriceBandPoint
		if err := rows.Scan(&p.Day, &p.Avg, &p.Min, &p.Max, &p.Samples); err != nil {
			return nil, fmt.Errorf("failed to scan price band: %w", err)
		}
		out = append(out, p)
	}
	return out, nil
}

// GetCategoryBreakdown returns the most common product types actually tracked.
func (c *Client) GetCategoryBreakdown(ctx context.Context, limit int) ([]models.CategoryCount, error) {
	if limit <= 0 || limit > 50 {
		limit = 8
	}

	rows, err := c.pool.Query(ctx, `
		SELECT product_type, COUNT(*) AS n
		FROM products
		WHERE product_type <> ''
		GROUP BY product_type
		ORDER BY n DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query categories: %w", err)
	}
	defer rows.Close()

	var out []models.CategoryCount
	for rows.Next() {
		var c models.CategoryCount
		if err := rows.Scan(&c.Name, &c.Count); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		out = append(out, c)
	}
	return out, nil
}
