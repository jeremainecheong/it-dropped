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
		case models.ChangeTypeNew:
			// The listing just appeared in this region. This is the only
			// event that can satisfy "tell me when it reaches my country".
			n, err := c.matchRegionAlerts(ctx, drop)
			if err != nil {
				return created, err
			}
			created += n

		case models.ChangeTypePriceDrop, models.ChangeTypePriceIncrease:
			// Increases are included because alert_type 'any_change' promises
			// both directions; matching only on price_drop made it a lie.
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

// matchRegionAlerts fires "tell me when this reaches my country" alerts.
//
// These are the only alerts not bound to a products row, because the row the
// user cares about does not exist when they subscribe. They are matched on
// (style_code, region) instead — the garment, and where they buy from.
func (c *Client) matchRegionAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	rows, err := c.pool.Query(ctx, `
		WITH target AS (
			SELECT style_code, region FROM products WHERE id = $1
		), fired AS (
			UPDATE region_alerts a
			SET triggered = TRUE, triggered_at = NOW()
			FROM target t
			WHERE a.style_code = t.style_code
			  AND a.region = t.region
			  AND a.is_active = TRUE
			  AND a.triggered = FALSE
			RETURNING a.user_id
		)
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT user_id, 'new_product', $2, $3, $4 FROM fired
		RETURNING id`,
		*drop.ProductID,
		fmt.Sprintf("Now in %s: %s", upper(drop.Region), drop.Title),
		fmt.Sprintf("Just listed at %s%.2f", currencySymbol(drop.Currency), drop.Price),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match region alerts: %w", err)
	}
	defer rows.Close()

	return countRows(rows), nil
}

// matchPriceAlerts fires alerts whose target price has been reached.
func (c *Client) matchPriceAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	isDrop := drop.ChangeType == models.ChangeTypePriceDrop

	notifType, heading := "price_increase", "Price up"
	if isDrop {
		notifType, heading = "price_drop", "Price drop"
	}

	// Insert straight from the select so the match and the write are atomic,
	// then flip the alert so it can't fire repeatedly on every later cycle.
	//
	// alert_type is matched explicitly. The previous condition was
	// `alert_type = 'any_change' OR price <= target_price`, which also caught
	// RESTOCK alerts — the modal stores the current price as their
	// target_price, so any later dip fired them with a "Price drop" body.
	rows, err := c.pool.Query(ctx, `
		WITH fired AS (
			UPDATE price_alerts a
			SET triggered = TRUE, triggered_at = NOW()
			WHERE a.product_id = $1
			  AND a.is_active = TRUE
			  AND a.triggered = FALSE
			  AND (
			        a.alert_type = 'any_change'
			     OR (a.alert_type = 'price_drop' AND $2::boolean AND $3::numeric <= a.target_price)
			  )
			RETURNING a.user_id
		)
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT user_id, $4, $5, $6, $7 FROM fired
		RETURNING id`,
		*drop.ProductID,
		isDrop,
		drop.Price,
		notifType,
		fmt.Sprintf("%s: %s", heading, drop.Title),
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
