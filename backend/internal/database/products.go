package database

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/yourusername/dropradar/internal/models"
)

// UpsertProduct inserts or updates a product
func (c *Client) UpsertProduct(ctx context.Context, p *models.Product) error {
	query := `
		INSERT INTO products (
			shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url, last_hash,
			style_code, color, all_sizes, available_variants, published_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
			$17, $18, $19, $20, $21
		)
		ON CONFLICT (shopify_id, region) DO UPDATE SET
			handle = EXCLUDED.handle,
			title = EXCLUDED.title,
			vendor = EXCLUDED.vendor,
			product_type = EXCLUDED.product_type,
			tags = EXCLUDED.tags,
			price = EXCLUDED.price,
			compare_price = EXCLUDED.compare_price,
			currency = EXCLUDED.currency,
			is_available = EXCLUDED.is_available,
			available_sizes = EXCLUDED.available_sizes,
			total_variants = EXCLUDED.total_variants,
			image_url = EXCLUDED.image_url,
			product_url = EXCLUDED.product_url,
			last_hash = EXCLUDED.last_hash,
			style_code = EXCLUDED.style_code,
			color = EXCLUDED.color,
			all_sizes = EXCLUDED.all_sizes,
			available_variants = EXCLUDED.available_variants,
			published_at = EXCLUDED.published_at,
			last_seen_at = NOW()
		RETURNING id`

	return c.pool.QueryRow(ctx, query,
		p.ShopifyID, p.Region, p.Handle, p.Title, p.Vendor, p.ProductType,
		p.Tags, p.Price, p.ComparePrice, p.Currency, p.IsAvailable,
		p.AvailableSizes, p.TotalVariants, p.ImageURL, p.ProductURL, p.LastHash,
		p.StyleCode, p.Color, p.AllSizes, p.AvailableVariants, p.PublishedAt,
	).Scan(&p.ID)
}

// priceUSDExpr normalises a regional price to approximate USD so price
// sorting is meaningful across storefronts — ¥28000 is cheaper than £205,
// but a raw `ORDER BY price` would rank it as the most expensive item.
//
// Keep these rates in sync with frontend/lib/currency.ts. They exist only to
// order and compare listings, never to quote a checkout price.
const priceUSDExpr = `(price * CASE currency
		WHEN 'USD' THEN 1.0
		WHEN 'GBP' THEN 1.27
		WHEN 'EUR' THEN 1.08
		WHEN 'JPY' THEN 0.0067
		WHEN 'AUD' THEN 0.65
		WHEN 'SGD' THEN 0.74
		ELSE 1.0
	END)`

// productColumns is the full-row projection, written once so that every query
// returning a models.Product selects the same columns in the same order as
// scanProduct reads them. Two hand-maintained copies of this list is how a
// column gets added to one query and silently missed by the other.
const productColumns = `id, shopify_id, region, handle, title, vendor, product_type,
		tags, price, compare_price, currency, is_available,
		available_sizes, total_variants, image_url, product_url,
		first_seen_at, last_seen_at, last_hash,
		COALESCE(style_code, handle), COALESCE(color, ''),
		COALESCE(all_sizes, '{}'), COALESCE(available_variants, 0), published_at`

// scanProduct reads one productColumns row into p.
func scanProduct(rows pgx.Rows, p *models.Product) error {
	return rows.Scan(
		&p.ID, &p.ShopifyID, &p.Region, &p.Handle, &p.Title, &p.Vendor, &p.ProductType,
		&p.Tags, &p.Price, &p.ComparePrice, &p.Currency, &p.IsAvailable,
		&p.AvailableSizes, &p.TotalVariants, &p.ImageURL, &p.ProductURL,
		&p.FirstSeenAt, &p.LastSeenAt, &p.LastHash,
		&p.StyleCode, &p.Color, &p.AllSizes, &p.AvailableVariants, &p.PublishedAt,
	)
}

// TouchProducts bumps last_seen_at for unchanged products in one statement,
// avoiding a full upsert per row when nothing else changed.
func (c *Client) TouchProducts(ctx context.Context, region string, shopifyIDs []int64) error {
	query := `
		UPDATE products
		SET last_seen_at = NOW()
		WHERE region = $1 AND shopify_id = ANY($2)`

	_, err := c.pool.Exec(ctx, query, region, shopifyIDs)
	return err
}

// GetProducts retrieves products with optional filters
func (c *Client) GetProducts(ctx context.Context, filter models.ProductFilter) ([]models.Product, error) {
	query := `
		SELECT ` + productColumns + `
		FROM products
		WHERE 1=1`

	args := []interface{}{}
	argNum := 1

	if filter.Region != "" {
		query += fmt.Sprintf(" AND region = $%d", argNum)
		args = append(args, filter.Region)
		argNum++
	}

	if len(filter.Categories) > 0 {
		query += fmt.Sprintf(" AND product_type = ANY($%d)", argNum)
		args = append(args, filter.Categories)
		argNum++
	}

	if filter.IsAvailable != nil {
		query += fmt.Sprintf(" AND is_available = $%d", argNum)
		args = append(args, *filter.IsAvailable)
		argNum++
	}

	// Every ordering ends in `id` so paging is stable: the sort keys below are
	// all non-unique, and LIMIT/OFFSET over a non-deterministic order can
	// duplicate or skip rows between pages.
	switch filter.Sort {
	case models.SortNewest:
		query += " ORDER BY first_seen_at DESC, id ASC"
	case models.SortPriceAsc:
		query += " ORDER BY " + priceUSDExpr + " ASC, id ASC"
	case models.SortPriceDesc:
		query += " ORDER BY " + priceUSDExpr + " DESC, id ASC"
	default:
		query += " ORDER BY last_seen_at DESC, id ASC"
	}

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
		return nil, fmt.Errorf("failed to query products: %w", err)
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		if err := scanProduct(rows, &p); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	// A read that dies mid-stream leaves rows.Next() returning false, exactly
	// like a clean end of results. Without this check a truncated read looks
	// like a short catalogue, and to the scraper a missing product is an
	// unseen product.
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read products: %w", err)
	}

	return products, nil
}

// ProductStub is the phase-1 projection of a product: the primary key, the
// natural key the diff joins on, and the fingerprint the diff compares.
//
// Nothing else is needed to decide whether a product changed since the last
// cycle, and the catalogue is several thousand rows per region, so reading
// the other twenty columns of every row — arrays, timestamps, URLs — is
// bandwidth spent on rows that will turn out to be identical.
type ProductStub struct {
	ID        uuid.UUID
	ShopifyID int64
	LastHash  string
}

// GetProductHashesByRegion is phase one of the diff: every product currently
// stored for a region, projected down to what the hash comparison needs.
//
// Phase two (GetProductsByShopifyIDs) fetches the full rows, but only for the
// products whose hash actually moved.
func (c *Client) GetProductHashesByRegion(ctx context.Context, region string) (map[int64]ProductStub, error) {
	rows, err := c.pool.Query(ctx, `
		SELECT id, shopify_id, last_hash
		FROM products
		WHERE region = $1`, region)
	if err != nil {
		return nil, fmt.Errorf("failed to query product hashes: %w", err)
	}
	defer rows.Close()

	result := make(map[int64]ProductStub)
	for rows.Next() {
		var s ProductStub
		if err := rows.Scan(&s.ID, &s.ShopifyID, &s.LastHash); err != nil {
			return nil, fmt.Errorf("failed to scan product hash: %w", err)
		}
		result[s.ShopifyID] = s
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read product hashes: %w", err)
	}

	return result, nil
}

// GetProductsByShopifyIDs is phase two of the diff: the full rows for a named
// set of products, keyed by shopify_id.
//
// DetectChanges compares the previous price, availability and size run, none
// of which phase one reads, so those columns are still needed — just for the
// products whose fingerprint changed rather than for the whole catalogue.
func (c *Client) GetProductsByShopifyIDs(ctx context.Context, region string, shopifyIDs []int64) (map[int64]*models.Product, error) {
	result := make(map[int64]*models.Product, len(shopifyIDs))
	if len(shopifyIDs) == 0 {
		return result, nil
	}

	rows, err := c.pool.Query(ctx, `
		SELECT `+productColumns+`
		FROM products
		WHERE region = $1 AND shopify_id = ANY($2)`, region, shopifyIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to query products by shopify id: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p models.Product
		if err := scanProduct(rows, &p); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		stored := p
		result[stored.ShopifyID] = &stored
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to read products by shopify id: %w", err)
	}

	return result, nil
}
