package database

import (
	"context"
	"os"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/yourusername/dropradar/internal/models"
)

// Seeded listings need a unique (shopify_id, region); tests run in one process.
var nextShopifyID atomic.Int64

// TestMain clears the tables these tests seed, so a second run against the
// same database doesn't collide with rows left by the first.
func TestMain(m *testing.M) {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		ctx := context.Background()
		c, err := New(ctx, dsn)
		if err != nil {
			panic("TEST_DATABASE_URL set but unreachable: " + err.Error())
		}
		_, err = c.pool.Exec(ctx, `
			TRUNCATE notifications, price_alerts, size_alerts, region_alerts,
			         drops, price_history, products RESTART IDENTITY CASCADE;
			TRUNCATE auth.users CASCADE;`)
		if err != nil {
			panic("failed to reset test database: " + err.Error())
		}
		c.Close()
	}
	os.Exit(m.Run())
}

// These exercise the alert matcher against a real Postgres, because every bug
// this file has produced lived in SQL that compiles fine and matches the wrong
// rows. Set TEST_DATABASE_URL to run; skipped otherwise.
func testClient(t *testing.T) *Client {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	c, err := New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(c.Close)
	return c
}

// seedUser creates an auth user and clears any state from a previous run.
func seedUser(t *testing.T, c *Client) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	var id uuid.UUID
	if err := c.pool.QueryRow(ctx,
		`INSERT INTO auth.users DEFAULT VALUES RETURNING id`).Scan(&id); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return id
}

// seedProduct inserts a listing in one region and returns its id.
func seedProduct(t *testing.T, c *Client, styleCode, region string, price float64, available bool) uuid.UUID {
	t.Helper()
	ctx := context.Background()

	var id uuid.UUID
	err := c.pool.QueryRow(ctx, `
		INSERT INTO products
			(shopify_id, region, handle, title, vendor, price, currency,
			 is_available, style_code, product_url)
		VALUES ($1, $2, $3, 'Test Jacket', 'Stussy', $4, 'USD', $5, $6, 'https://example.com')
		RETURNING id`,
		// (shopify_id, region) is unique; a counter keeps seeds independent.
		nextShopifyID.Add(1),
		region, styleCode+"-"+region, price, available, styleCode,
	).Scan(&id)
	if err != nil {
		t.Fatalf("seed product: %v", err)
	}
	return id
}

func countNotifications(t *testing.T, c *Client, userID uuid.UUID, notifType string) int {
	t.Helper()

	var n int
	err := c.pool.QueryRow(context.Background(),
		`SELECT count(*) FROM notifications WHERE user_id = $1 AND type = $2`,
		userID, notifType).Scan(&n)
	if err != nil {
		t.Fatalf("count notifications: %v", err)
	}
	return n
}

// The headline case: a garment listed in JP but not SG. The SG listing does
// not exist when the user subscribes, so the alert cannot reference it.
func TestRegionAlertFiresWhenGarmentReachesUsersRegion(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()
	user := seedUser(t, c)

	const style = "STYLE-REGION-1"
	seedProduct(t, c, style, "jp", 200, true) // exists abroad only

	if _, err := c.pool.Exec(ctx, `
		INSERT INTO region_alerts (user_id, style_code, region, title)
		VALUES ($1, $2, 'sg', 'Test Jacket')`, user, style); err != nil {
		t.Fatalf("create region alert: %v", err)
	}

	// The scraper later finds it in SG. That is a brand-new row.
	sgID := seedProduct(t, c, style, "sg", 260, true)
	drop := models.Drop{
		ProductID:  &sgID,
		Region:     "sg",
		ChangeType: models.ChangeTypeNew,
		Title:      "Test Jacket",
		Price:      260,
		Currency:   "SGD",
	}

	created, err := c.MatchAlerts(ctx, []models.Drop{drop})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 1 {
		t.Fatalf("created = %d, want 1", created)
	}
	if got := countNotifications(t, c, user, "new_product"); got != 1 {
		t.Errorf("new_product notifications = %d, want 1", got)
	}

	// A later cycle must not re-notify.
	again, err := c.MatchAlerts(ctx, []models.Drop{drop})
	if err != nil {
		t.Fatalf("MatchAlerts (second): %v", err)
	}
	if again != 0 {
		t.Errorf("second MatchAlerts created %d notifications, want 0", again)
	}
}

// A region alert is scoped to ONE region. A launch elsewhere must not fire it.
func TestRegionAlertIgnoresOtherRegions(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()
	user := seedUser(t, c)

	const style = "STYLE-REGION-2"
	if _, err := c.pool.Exec(ctx, `
		INSERT INTO region_alerts (user_id, style_code, region, title)
		VALUES ($1, $2, 'sg', 'Test Jacket')`, user, style); err != nil {
		t.Fatalf("create region alert: %v", err)
	}

	auID := seedProduct(t, c, style, "au", 300, true)
	created, err := c.MatchAlerts(ctx, []models.Drop{{
		ProductID: &auID, Region: "au", ChangeType: models.ChangeTypeNew,
		Title: "Test Jacket", Price: 300, Currency: "AUD",
	}})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 0 {
		t.Errorf("created = %d, want 0 — an AU launch must not fire an SG alert", created)
	}
}

// Regression: the matcher's WHERE clause was
// `alert_type = 'any_change' OR price <= target_price`, which caught RESTOCK
// alerts too — the UI stores the current price as their target_price, so any
// later dip fired them with a "Price drop" body.
func TestPriceDropDoesNotFireRestockAlerts(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()
	user := seedUser(t, c)

	productID := seedProduct(t, c, "STYLE-PRICE-1", "us", 100, true)
	if _, err := c.pool.Exec(ctx, `
		INSERT INTO price_alerts (user_id, product_id, target_price, alert_type)
		VALUES ($1, $2, 100, 'restock')`, user, productID); err != nil {
		t.Fatalf("create restock alert: %v", err)
	}

	created, err := c.MatchAlerts(ctx, []models.Drop{{
		ProductID: &productID, Region: "us", ChangeType: models.ChangeTypePriceDrop,
		Title: "Test Jacket", Price: 80, Currency: "USD", OldValue: "100.00",
	}})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 0 {
		t.Errorf("created = %d, want 0 — a price drop must not fire a restock alert", created)
	}
}

// Regression: MatchAlerts only switched on ChangeTypePriceDrop, so an
// 'any_change' alert never fired on a rise despite promising both directions.
func TestAnyChangeAlertFiresOnPriceIncrease(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()
	user := seedUser(t, c)

	productID := seedProduct(t, c, "STYLE-PRICE-2", "us", 100, true)
	if _, err := c.pool.Exec(ctx, `
		INSERT INTO price_alerts (user_id, product_id, target_price, alert_type)
		VALUES ($1, $2, 100, 'any_change')`, user, productID); err != nil {
		t.Fatalf("create any_change alert: %v", err)
	}

	created, err := c.MatchAlerts(ctx, []models.Drop{{
		ProductID: &productID, Region: "us", ChangeType: models.ChangeTypePriceIncrease,
		Title: "Test Jacket", Price: 130, Currency: "USD", OldValue: "100.00",
	}})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 1 {
		t.Fatalf("created = %d, want 1", created)
	}
	if got := countNotifications(t, c, user, "price_increase"); got != 1 {
		t.Errorf("price_increase notifications = %d, want 1", got)
	}
}

// A price_drop alert still requires the target to actually be reached.
func TestPriceDropAlertRespectsTarget(t *testing.T) {
	c := testClient(t)
	ctx := context.Background()
	user := seedUser(t, c)

	productID := seedProduct(t, c, "STYLE-PRICE-3", "us", 100, true)
	if _, err := c.pool.Exec(ctx, `
		INSERT INTO price_alerts (user_id, product_id, target_price, alert_type)
		VALUES ($1, $2, 70, 'price_drop')`, user, productID); err != nil {
		t.Fatalf("create price_drop alert: %v", err)
	}

	// 90 is a drop, but above the 70 target.
	created, err := c.MatchAlerts(ctx, []models.Drop{{
		ProductID: &productID, Region: "us", ChangeType: models.ChangeTypePriceDrop,
		Title: "Test Jacket", Price: 90, Currency: "USD", OldValue: "100.00",
	}})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 0 {
		t.Fatalf("created = %d at 90 vs target 70, want 0", created)
	}

	// 65 clears it.
	created, err = c.MatchAlerts(ctx, []models.Drop{{
		ProductID: &productID, Region: "us", ChangeType: models.ChangeTypePriceDrop,
		Title: "Test Jacket", Price: 65, Currency: "USD", OldValue: "90.00",
	}})
	if err != nil {
		t.Fatalf("MatchAlerts: %v", err)
	}
	if created != 1 {
		t.Errorf("created = %d at 65 vs target 70, want 1", created)
	}
}
