package database

import (
	"context"
	"fmt"

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
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash,
			COALESCE(style_code, handle), COALESCE(color, ''),
			COALESCE(all_sizes, '{}'), COALESCE(available_variants, 0), published_at
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
		if err := rows.Scan(
			&p.ID, &p.ShopifyID, &p.Region, &p.Handle, &p.Title, &p.Vendor, &p.ProductType,
			&p.Tags, &p.Price, &p.ComparePrice, &p.Currency, &p.IsAvailable,
			&p.AvailableSizes, &p.TotalVariants, &p.ImageURL, &p.ProductURL,
			&p.FirstSeenAt, &p.LastSeenAt, &p.LastHash,
			&p.StyleCode, &p.Color, &p.AllSizes, &p.AvailableVariants, &p.PublishedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	return products, nil
}

// GetAllProductsByRegion retrieves all products for a region (for diff comparison)
func (c *Client) GetAllProductsByRegion(ctx context.Context, region string) (map[int64]*models.Product, error) {
	products, err := c.GetProducts(ctx, models.ProductFilter{Region: region})
	if err != nil {
		return nil, err
	}

	result := make(map[int64]*models.Product)
	for i := range products {
		result[products[i].ShopifyID] = &products[i]
	}
	return result, nil
}




