package database

import (
	"context"
	"fmt"
	"time"

	"github.com/yourusername/dropradar/internal/models"
)

// CreateScrapeLog starts a new scrape log entry
func (c *Client) CreateScrapeLog(ctx context.Context, region string) (*models.ScrapeLog, error) {
	query := `
		INSERT INTO scrape_logs (region, status)
		VALUES ($1, 'running')
		RETURNING id, started_at`

	log := &models.ScrapeLog{Region: region, Status: models.ScrapeStatusRunning}
	err := c.pool.QueryRow(ctx, query, region).Scan(&log.ID, &log.StartedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create scrape log: %w", err)
	}

	return log, nil
}

// CompleteScrapeLog marks a scrape log as complete
func (c *Client) CompleteScrapeLog(ctx context.Context, log *models.ScrapeLog) error {
	completedAt := time.Now()
	durationMs := int(completedAt.Sub(log.StartedAt).Milliseconds())

	query := `
		UPDATE scrape_logs SET
			completed_at = $1,
			status = $2,
			products_found = $3,
			new_count = $4,
			restock_count = $5,
			price_changes = $6,
			error_message = $7,
			duration_ms = $8
		WHERE id = $9`

	_, err := c.pool.Exec(ctx, query,
		completedAt, log.Status, log.ProductsFound, log.NewCount,
		log.RestockCount, log.PriceChanges, log.ErrorMessage, durationMs, log.ID,
	)
	return err
}

// GetRecentScrapeLogs retrieves recent scrape logs
func (c *Client) GetRecentScrapeLogs(ctx context.Context, limit int) ([]models.ScrapeLog, error) {
	query := `
		SELECT id, region, started_at, completed_at, status,
			products_found, new_count, restock_count, price_changes,
			error_message, duration_ms
		FROM scrape_logs
		ORDER BY started_at DESC
		LIMIT $1`

	rows, err := c.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query scrape logs: %w", err)
	}
	defer rows.Close()

	var logs []models.ScrapeLog
	for rows.Next() {
		var l models.ScrapeLog
		if err := rows.Scan(
			&l.ID, &l.Region, &l.StartedAt, &l.CompletedAt, &l.Status,
			&l.ProductsFound, &l.NewCount, &l.RestockCount, &l.PriceChanges,
			&l.ErrorMessage, &l.DurationMs,
		); err != nil {
			return nil, fmt.Errorf("failed to scan scrape log: %w", err)
		}
		logs = append(logs, l)
	}

	return logs, nil
}

// GetLatestScrapeLogByRegion gets the most recent scrape log for a region
func (c *Client) GetLatestScrapeLogByRegion(ctx context.Context, region string) (*models.ScrapeLog, error) {
	query := `
		SELECT id, region, started_at, completed_at, status,
			products_found, new_count, restock_count, price_changes,
			error_message, duration_ms
		FROM scrape_logs
		WHERE region = $1
		ORDER BY started_at DESC
		LIMIT 1`

	var l models.ScrapeLog
	err := c.pool.QueryRow(ctx, query, region).Scan(
		&l.ID, &l.Region, &l.StartedAt, &l.CompletedAt, &l.Status,
		&l.ProductsFound, &l.NewCount, &l.RestockCount, &l.PriceChanges,
		&l.ErrorMessage, &l.DurationMs,
	)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
