package database

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

		case models.ChangeTypeSoldOut:
			n, err := c.matchSoldOutAlerts(ctx, drop)
			if err != nil {
				return created, err
			}
			created += n

		case models.ChangeTypeSizeSoldOut:
			// Nothing to notify — the user asked to hear when a size comes
			// back, not when it goes. This branch exists because nothing
			// consumed size_sold_out at all, so a size alert fired once and
			// stayed triggered for the rest of its life: ReArmAlerts only runs
			// when the WHOLE listing goes unavailable, which is precisely the
			// case differ.go does not emit size_sold_out for. Re-arming here
			// is what makes a size alert repeatable.
			if err := c.reArmSizeAlerts(ctx, *drop.ProductID, splitSizes(drop.NewValue)); err != nil {
				return created, err
			}
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
			  -- Inside the UPDATE, not on the INSERT below: filtering the
			  -- insert would still flip triggered, so muting drops for a
			  -- while would silently consume every alert that matched
			  -- meanwhile and none of them would fire again on unmute.
			  AND wants_notification(a.user_id, 'drops')
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

	n, err := countRows(rows)
	if err != nil {
		return n, fmt.Errorf("failed to match region alerts: %w", err)
	}
	return n, nil
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
			  -- /profile's "Price changes" switch, which had no reader at all
			  -- until now. See the note in matchRegionAlerts for why the gate
			  -- belongs in the UPDATE rather than on the INSERT.
			  AND wants_notification(a.user_id, 'price_changes')
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

	n, err := countRows(rows)
	if err != nil {
		return n, fmt.Errorf("failed to match price alerts: %w", err)
	}
	return n, nil
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

	n, err := countRows(rows)
	if err != nil {
		return n, fmt.Errorf("failed to match restock alerts: %w", err)
	}
	return n, nil
}

// matchSizeAlerts fires "tell me when a Medium is back" alerts. This is the
// request streetwear buyers actually make, and the table for it had no reader
// anywhere in the codebase.
//
// Only the sizes that just returned are matched. Matching drop.AvailableSizes —
// the full current size run — meant an L-only restock fired every pending M
// alert on the listing with the body "Size M is available again", for a size
// that had been in stock the whole time.
func (c *Client) matchSizeAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	returned := returnedSizes(drop)
	if len(returned) == 0 {
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
		returned,
		fmt.Sprintf("Your size is back: %s", drop.Title),
		upper(drop.Region),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match size alerts: %w", err)
	}
	defer rows.Close()

	n, err := countRows(rows)
	if err != nil {
		return n, fmt.Errorf("failed to match size alerts: %w", err)
	}
	return n, nil
}

// matchSoldOutAlerts tells the people waiting on a listing that it has just
// gone. Sold-out had no delivery path at all: no branch here, and no legal
// value in the notifications type CHECK, so the one event a cross-region
// tracker is most useful for ("gone in SG, still up in JP") reached nobody.
//
// It reuses the existing 'restock' alert rather than adding an alert kind:
// that alert already means "watch this listing's availability for me", and
// sell-out is that same signal in the other direction.
//
// Two deliberate differences from the other matchers:
//   - triggered is not set. differ.go emits sold_out only on the
//     available -> unavailable edge, so there is nothing to de-duplicate, and
//     spending the alert's one arm on a sold-out notice would cancel the
//     restock notification the user actually subscribed for.
//   - triggered = FALSE is not required. An alert that fired on the previous
//     restock is still marked triggered at this point (scraper.go calls
//     ReArmAlerts after MatchAlerts), and that user — told it was back, did
//     not buy — is exactly who needs to know it is gone again.
func (c *Client) matchSoldOutAlerts(ctx context.Context, drop *models.Drop) (int, error) {
	rows, err := c.pool.Query(ctx, `
		INSERT INTO notifications (user_id, type, title, body, link)
		SELECT a.user_id, 'sold_out', $2, $3, $4
		FROM price_alerts a
		WHERE a.product_id = $1
		  AND a.is_active = TRUE
		  AND a.alert_type = 'restock'
		RETURNING id`,
		*drop.ProductID,
		fmt.Sprintf("Sold out: %s", drop.Title),
		fmt.Sprintf("Gone in %s — check the other regions on the product page", upper(drop.Region)),
		fmt.Sprintf("/product/%s", drop.ProductID.String()),
	)
	if err != nil {
		return 0, fmt.Errorf("failed to match sold out alerts: %w", err)
	}
	defer rows.Close()

	n, err := countRows(rows)
	if err != nil {
		return n, fmt.Errorf("failed to match sold out alerts: %w", err)
	}
	return n, nil
}

// reArmSizeAlerts puts the named sizes' alerts back on watch after those sizes
// have disappeared again. Without this a size alert is a one-shot: it fires on
// the first restock and nothing ever clears triggered unless the entire listing
// sells out.
func (c *Client) reArmSizeAlerts(ctx context.Context, productID uuid.UUID, sizes []string) error {
	if len(sizes) == 0 {
		return nil
	}
	_, err := c.pool.Exec(ctx, `
		UPDATE size_alerts SET triggered = FALSE, triggered_at = NULL
		WHERE product_id = $1 AND triggered = TRUE AND size = ANY($2)`,
		productID, sizes,
	)
	if err != nil {
		return fmt.Errorf("failed to re-arm size alerts: %w", err)
	}
	return nil
}

// returnedSizes is the set of sizes a restock drop has just made buyable.
//
// For a size_restock, differ.go puts exactly those sizes in NewValue; the
// drop's AvailableSizes is the whole current run and says nothing about what
// changed. For a whole-listing restock NewValue is just "available", and every
// listed size did in fact just become buyable because the listing was
// unavailable a moment ago.
func returnedSizes(drop *models.Drop) []string {
	if drop.ChangeType == models.ChangeTypeSizeRestock {
		return splitSizes(drop.NewValue)
	}
	return drop.AvailableSizes
}

// splitSizes parses the comma-joined size lists differ.go writes into a drop's
// OldValue/NewValue.
func splitSizes(joined string) []string {
	if joined == "" {
		return nil
	}
	parts := strings.Split(joined, ",")
	sizes := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			sizes = append(sizes, s)
		}
	}
	return sizes
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

// countRows counts the rows an INSERT ... RETURNING streamed back.
//
// It used to take `interface{ Next() bool }`, which structurally could not see
// rows.Err(): pgx reports a connection that died mid-stream by ending
// iteration and stashing the error there, so a half-delivered batch of
// notifications was counted as a smaller success and MatchAlerts returned nil.
func countRows(rows pgx.Rows) (int, error) {
	n := 0
	for rows.Next() {
		n++
	}
	return n, rows.Err()
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
