package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yourusername/dropradar/internal/models"
)

// UpsertSubscriber inserts or updates a subscriber
func (c *Client) UpsertSubscriber(ctx context.Context, s *models.Subscriber) error {
	query := `
		INSERT INTO subscribers (
			telegram_id, chat_id, username, first_name, last_name, regions
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (telegram_id) DO UPDATE SET
			chat_id = EXCLUDED.chat_id,
			username = EXCLUDED.username,
			first_name = EXCLUDED.first_name,
			last_name = EXCLUDED.last_name,
			is_active = true,
			updated_at = NOW()
		RETURNING id, created_at, updated_at`

	return c.pool.QueryRow(ctx, query,
		s.TelegramID, s.ChatID, s.Username, s.FirstName, s.LastName, s.Regions,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
}

// GetSubscriber retrieves a subscriber by Telegram ID
func (c *Client) GetSubscriber(ctx context.Context, telegramID int64) (*models.Subscriber, error) {
	query := `
		SELECT id, telegram_id, chat_id, username, first_name, last_name,
			regions, keywords, excluded_keywords, min_price, max_price,
			notify_new, notify_restock, notify_price, is_active,
			created_at, updated_at, last_notified
		FROM subscribers
		WHERE telegram_id = $1`

	var s models.Subscriber
	err := c.pool.QueryRow(ctx, query, telegramID).Scan(
		&s.ID, &s.TelegramID, &s.ChatID, &s.Username, &s.FirstName, &s.LastName,
		&s.Regions, &s.Keywords, &s.ExcludedKeywords, &s.MinPrice, &s.MaxPrice,
		&s.NotifyNew, &s.NotifyRestock, &s.NotifyPrice, &s.IsActive,
		&s.CreatedAt, &s.UpdatedAt, &s.LastNotified,
	)

	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get subscriber: %w", err)
	}

	return &s, nil
}

// GetActiveSubscribers retrieves all active subscribers
func (c *Client) GetActiveSubscribers(ctx context.Context) ([]models.Subscriber, error) {
	query := `
		SELECT id, telegram_id, chat_id, username, first_name, last_name,
			regions, keywords, excluded_keywords, min_price, max_price,
			notify_new, notify_restock, notify_price, is_active,
			created_at, updated_at, last_notified
		FROM subscribers
		WHERE is_active = true`

	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query subscribers: %w", err)
	}
	defer rows.Close()

	var subscribers []models.Subscriber
	for rows.Next() {
		var s models.Subscriber
		if err := rows.Scan(
			&s.ID, &s.TelegramID, &s.ChatID, &s.Username, &s.FirstName, &s.LastName,
			&s.Regions, &s.Keywords, &s.ExcludedKeywords, &s.MinPrice, &s.MaxPrice,
			&s.NotifyNew, &s.NotifyRestock, &s.NotifyPrice, &s.IsActive,
			&s.CreatedAt, &s.UpdatedAt, &s.LastNotified,
		); err != nil {
			return nil, fmt.Errorf("failed to scan subscriber: %w", err)
		}
		subscribers = append(subscribers, s)
	}

	return subscribers, nil
}

// UpdateSubscriberRegions updates subscriber regions
func (c *Client) UpdateSubscriberRegions(ctx context.Context, telegramID int64, regions []string) error {
	query := `UPDATE subscribers SET regions = $1, updated_at = NOW() WHERE telegram_id = $2`
	_, err := c.pool.Exec(ctx, query, regions, telegramID)
	return err
}

// UpdateSubscriberNotifySettings updates notification preferences
func (c *Client) UpdateSubscriberNotifySettings(ctx context.Context, telegramID int64, notifyNew, notifyRestock, notifyPrice bool) error {
	query := `UPDATE subscribers SET notify_new = $1, notify_restock = $2, notify_price = $3, updated_at = NOW() WHERE telegram_id = $4`
	_, err := c.pool.Exec(ctx, query, notifyNew, notifyRestock, notifyPrice, telegramID)
	return err
}

// DeactivateSubscriber deactivates a subscriber
func (c *Client) DeactivateSubscriber(ctx context.Context, telegramID int64) error {
	query := `UPDATE subscribers SET is_active = false, updated_at = NOW() WHERE telegram_id = $1`
	_, err := c.pool.Exec(ctx, query, telegramID)
	return err
}

// CountActiveSubscribers returns the number of active subscribers
func (c *Client) CountActiveSubscribers(ctx context.Context) (int, error) {
	var count int
	err := c.pool.QueryRow(ctx, `SELECT COUNT(*) FROM subscribers WHERE is_active = true`).Scan(&count)
	return count, err
}
