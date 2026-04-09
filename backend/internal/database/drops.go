package database

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/yourusername/dropradar/internal/models"
)

// CreateDrop inserts a new drop
func (c *Client) CreateDrop(ctx context.Context, d *models.Drop) error {
	query := `
		INSERT INTO drops (
			product_id, shopify_id, region, change_type, title,
			price, currency, image_url, product_url,
			old_value, new_value, available_sizes
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, detected_at`

	return c.pool.QueryRow(ctx, query,
		d.ProductID, d.ShopifyID, d.Region, d.ChangeType, d.Title,
		d.Price, d.Currency, d.ImageURL, d.ProductURL,
		d.OldValue, d.NewValue, d.AvailableSizes,
	).Scan(&d.ID, &d.DetectedAt)
}

// GetDrops retrieves drops with optional filters
func (c *Client) GetDrops(ctx context.Context, filter models.DropFilter) ([]models.Drop, error) {
	query := `
		SELECT id, product_id, shopify_id, region, change_type, title,
			price, currency, image_url, product_url,
			old_value, new_value, available_sizes,
			detected_at, notified, notified_at
		FROM drops
		WHERE 1=1`

	args := []interface{}{}
	argNum := 1

	if filter.Region != "" {
		query += fmt.Sprintf(" AND region = $%d", argNum)
		args = append(args, filter.Region)
		argNum++
	}

	if filter.ChangeType != "" {
		query += fmt.Sprintf(" AND change_type = $%d", argNum)
		args = append(args, filter.ChangeType)
		argNum++
	}

	if filter.Notified != nil {
		query += fmt.Sprintf(" AND notified = $%d", argNum)
		args = append(args, *filter.Notified)
		argNum++
	}

	query += " ORDER BY detected_at DESC"

	if filter.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argNum)
		args = append(args, filter.Limit)
		argNum++
	}

	if filter.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argNum)
		args = append(args, filter.Offset)
	}

	rows, err := c.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query drops: %w", err)
	}
	defer rows.Close()

	var drops []models.Drop
	for rows.Next() {
		var d models.Drop
		if err := rows.Scan(
			&d.ID, &d.ProductID, &d.ShopifyID, &d.Region, &d.ChangeType, &d.Title,
			&d.Price, &d.Currency, &d.ImageURL, &d.ProductURL,
			&d.OldValue, &d.NewValue, &d.AvailableSizes,
			&d.DetectedAt, &d.Notified, &d.NotifiedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan drop: %w", err)
		}
		drops = append(drops, d)
	}

	return drops, nil
}

// GetUnnotifiedDrops retrieves drops that haven't been notified yet
func (c *Client) GetUnnotifiedDrops(ctx context.Context) ([]models.Drop, error) {
	notified := false
	return c.GetDrops(ctx, models.DropFilter{Notified: &notified, Limit: 100})
}

// MarkDropNotified marks a drop as notified
func (c *Client) MarkDropNotified(ctx context.Context, dropID uuid.UUID) error {
	query := `UPDATE drops SET notified = true, notified_at = $1 WHERE id = $2`
	_, err := c.pool.Exec(ctx, query, time.Now(), dropID)
	return err
}

// CountDrops returns the total number of drops matching the filter
func (c *Client) CountDrops(ctx context.Context, filter models.DropFilter) (int, error) {
	query := `SELECT COUNT(*) FROM drops WHERE 1=1`
	args := []interface{}{}
	argNum := 1

	if filter.Region != "" {
		query += fmt.Sprintf(" AND region = $%d", argNum)
		args = append(args, filter.Region)
		argNum++
	}

	if filter.ChangeType != "" {
		query += fmt.Sprintf(" AND change_type = $%d", argNum)
		args = append(args, filter.ChangeType)
		argNum++
	}

	if filter.Notified != nil {
		query += fmt.Sprintf(" AND notified = $%d", argNum)
		args = append(args, *filter.Notified)
	}

	var count int
	err := c.pool.QueryRow(ctx, query, args...).Scan(&count)
	return count, err
}
