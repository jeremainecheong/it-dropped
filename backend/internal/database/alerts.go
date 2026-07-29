package database

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/yourusername/dropradar/internal/models"
)

// MatchAlerts turns detected drops into in-app notifications.
//
// The web app has always let users create price and size alerts, and the
// notification bell has always listened for rows — but nothing ever joined the
// two, so an alert could be created and could never fire. This closes that
// loop: for each drop, find the active alerts it satisfies and insert a
// notification row for the owning user.
//
// Returns the number of notifications created.
func (c *Client) MatchAlerts(ctx context.Context, drops []models.Drop) (int, error) {
	created := 0

	for i := range drops {
		drop := &drops[i]
		if drop.ProductID == nil {
			continue
		}

		switch drop.ChangeType {
		case models.ChangeTypePriceDrop:
			n, err := c.matchPriceAlerts(ctx, drop)
			if err != nil {
				return created, err
			}
			created += n

		case models.ChangeTypeRestock, models.ChangeTypeSizeRestock:
			n, err := c.matchRestockAlerts(ctx, drop)
			if err != nil {
				return created, err
			}
			created += n

			m, err := c.matchSizeAlerts(ctx, drop)
			if err != nil {
				return created, err
			}
			created += m
		}
	}

	return created, nil
}

// matchPriceAlerts fires alerts whose target price has been reached.
func (c *Client) matchPriceAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	// Insert straight from the select so the match and the write are atomic,
	// then flip the alert so it can't fire repeatedly on every later cycle.
	rows, err := c.pool.Query(ctx, `
		WITH fired AS (
			UPDATE price_alerts a
			SET triggered = TRUE, triggered_at = NOW()
			WHERE a.product_id = $1
			  AND a.is_active = TRUE
			  AND a.triggered = FALSE
			  AND (a.alert_type = 'any_change' OR ($2::numeric <= a.target_price))
			RETURNING a.user_id
		)
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT user_id, 'price_drop', $3, $4, $5 FROM fired
		RETURNING id`,
		*drop.ProductID,
		drop.Price,
		fmt.Sprintf("Price drop: %s", drop.Title),
		fmt.Sprintf("Now %s%.2f in %s (was %s)", currencySymbol(drop.Currency), drop.Price, upper(drop.Region), drop.OldValue),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match price alerts: %w", err)
	}
	defer rows.Close()

	return countRows(rows), nil
}

// matchRestockAlerts fires alerts registered with alert_type 'restock'.
func (c *Client) matchRestockAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	rows, err := c.pool.Query(ctx, `
		WITH fired AS (
			UPDATE price_alerts a
			SET triggered = TRUE, triggered_at = NOW()
			WHERE a.product_id = $1
			  AND a.is_active = TRUE
			  AND a.triggered = FALSE
			  AND a.alert_type = 'restock'
			RETURNING a.user_id
		)
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT user_id, 'restock', $2, $3, $4 FROM fired
		RETURNING id`,
		*drop.ProductID,
		fmt.Sprintf("Back in stock: %s", drop.Title),
		fmt.Sprintf("Available again in %s", upper(drop.Region)),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match restock alerts: %w", err)
	}
	defer rows.Close()

	return countRows(rows), nil
}

// matchSizeAlerts fires "tell me when a Medium is back" alerts. This is the
// request streetwear buyers actually make, and the table for it had no reader
// anywhere in the codebase.
func (c *Client) matchSizeAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	if len(drop.AvailableSizes) == 0 {
		return 0, nil
	}

	rows, err := c.pool.Query(ctx, `
		WITH fired AS (
			UPDATE size_alerts a
			SET triggered = TRUE, triggered_at = NOW()
			WHERE a.product_id = $1
			  AND a.is_active = TRUE
			  AND a.triggered = FALSE
			  AND a.size = ANY($2)
			RETURNING a.user_id, a.size
		)
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT user_id, 'restock', $3, 'Size ' || size || ' is available again in ' || $4, $5 FROM fired
		RETURNING id`,
		*drop.ProductID,
		drop.AvailableSizes,
		fmt.Sprintf("Your size is back: %s", drop.Title),
		upper(drop.Region),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match size alerts: %w", err)
	}
	defer rows.Close()

	return countRows(rows), nil
}

// ReArmAlerts reactivates triggered alerts once the condition has cleared, so
// a user who asked to hear about restocks keeps hearing about them instead of
// being served exactly once and then going silent forever.
func (c *Client) ReArmAlerts(ctx context.Context, productID uuid.UUID, isAvailable bool) error {
	if isAvailable {
		return nil
	}
	_, err := c.pool.Exec(ctx, `
		UPDATE price_alerts SET triggered = FALSE, triggered_at = NULL
		WHERE product_id = $1 AND alert_type = 'restock' AND triggered = TRUE`,
		productID,
	)
	if err != nil {
		return err
	}
	_, err = c.pool.Exec(ctx, `
		UPDATE size_alerts SET triggered = FALSE, triggered_at = NULL
		WHERE product_id = $1 AND triggered = TRUE`,
		productID,
	)
	return err
}

func countRows(rows interface{ Next() bool }) int {
	n := 0
	for rows.Next() {
		n++
	}
	return n
}

func upper(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'a' && b[i] <= 'z' {
			b[i] -= 32
		}
	}
	return string(b)
}

func currencySymbol(code string) string {
	switch upper(code) {
	case "USD":
		return "$"
	case "GBP":
		return "£"
	case "EUR":
		return "€"
	case "JPY":
		return "¥"
	case "AUD":
		return "A$"
	case "SGD":
		return "S$"
	}
	return code + " "
}
