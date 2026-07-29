package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/yourusername/dropradar/internal/models"
)

// UpsertProduct inserts or updates a product
func (c *Client) UpsertProduct(ctx context.Context, p *models.Product) error {
	query := `
		INSERT INTO products (
			shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url, last_hash
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
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
			last_seen_at = NOW()
		RETURNING id`

	return c.pool.QueryRow(ctx, query,
		p.ShopifyID, p.Region, p.Handle, p.Title, p.Vendor, p.ProductType,
		p.Tags, p.Price, p.ComparePrice, p.Currency, p.IsAvailable,
		p.AvailableSizes, p.TotalVariants, p.ImageURL, p.ProductURL, p.LastHash,
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

// GetProductByShopifyID retrieves a product by Shopify ID and region
func (c *Client) GetProductByShopifyID(ctx context.Context, shopifyID int64, region string) (*models.Product, error) {
	query := `
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash
		FROM products
		WHERE shopify_id = $1 AND region = $2`

	var p models.Product
	err := c.pool.QueryRow(ctx, query, shopifyID, region).Scan(
		&p.ID, &p.ShopifyID, &p.Region, &p.Handle, &p.Title, &p.Vendor, &p.ProductType,
		&p.Tags, &p.Price, &p.ComparePrice, &p.Currency, &p.IsAvailable,
		&p.AvailableSizes, &p.TotalVariants, &p.ImageURL, &p.ProductURL,
		&p.FirstSeenAt, &p.LastSeenAt, &p.LastHash,
	)

	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get product: %w", err)
	}

	return &p, nil
}

// GetProductByID retrieves a product by its UUID
func (c *Client) GetProductByID(ctx context.Context, id string) (*models.Product, error) {
	query := `
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash
		FROM products
		WHERE id = $1`

	var p models.Product
	err := c.pool.QueryRow(ctx, query, id).Scan(
		&p.ID, &p.ShopifyID, &p.Region, &p.Handle, &p.Title, &p.Vendor, &p.ProductType,
		&p.Tags, &p.Price, &p.ComparePrice, &p.Currency, &p.IsAvailable,
		&p.AvailableSizes, &p.TotalVariants, &p.ImageURL, &p.ProductURL,
		&p.FirstSeenAt, &p.LastSeenAt, &p.LastHash,
	)

	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get product: %w", err)
	}

	return &p, nil
}

// GetProducts retrieves products with optional filters
func (c *Client) GetProducts(ctx context.Context, filter models.ProductFilter) ([]models.Product, error) {
	query := `
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash
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

// CountProducts returns the total number of products matching the filter
func (c *Client) CountProducts(ctx context.Context, filter models.ProductFilter) (int, error) {
	query := `SELECT COUNT(*) FROM products WHERE 1=1`
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
	}

	var count int
	err := c.pool.QueryRow(ctx, query, args...).Scan(&count)
	return count, err
}

// GetCategories returns a list of unique product categories (product_type)
func (c *Client) GetCategories(ctx context.Context) ([]string, error) {
	query := `SELECT DISTINCT product_type FROM products WHERE product_type IS NOT NULL AND product_type != '' ORDER BY product_type`

	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query categories: %w", err)
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var category string
		if err := rows.Scan(&category); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		categories = append(categories, category)
	}

	return categories, nil
}

// SearchProducts performs full-text search on products
func (c *Client) SearchProducts(ctx context.Context, query string, region string, limit int) ([]models.Product, error) {
	sqlQuery := `
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash,
			ts_rank(search_vector, plainto_tsquery('english', $1)) as rank
		FROM products
		WHERE search_vector @@ plainto_tsquery('english', $1)`

	args := []interface{}{query}
	argNum := 2

	if region != "" {
		sqlQuery += fmt.Sprintf(" AND region = $%d", argNum)
		args = append(args, region)
		argNum++
	}

	sqlQuery += " ORDER BY rank DESC"
	sqlQuery += fmt.Sprintf(" LIMIT $%d", argNum)
	args = append(args, limit)

	rows, err := c.pool.Query(ctx, sqlQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to search products: %w", err)
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		var rank float64
		if err := rows.Scan(
			&p.ID, &p.ShopifyID, &p.Region, &p.Handle, &p.Title, &p.Vendor, &p.ProductType,
			&p.Tags, &p.Price, &p.ComparePrice, &p.Currency, &p.IsAvailable,
			&p.AvailableSizes, &p.TotalVariants, &p.ImageURL, &p.ProductURL,
			&p.FirstSeenAt, &p.LastSeenAt, &p.LastHash, &rank,
		); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	return products, nil
}

// GetProductsByHandle returns all products with the given handle across all regions
func (c *Client) GetProductsByHandle(ctx context.Context, handle string) ([]models.Product, error) {
	query := `
		SELECT id, shopify_id, region, handle, title, vendor, product_type,
			tags, price, compare_price, currency, is_available,
			available_sizes, total_variants, image_url, product_url,
			first_seen_at, last_seen_at, last_hash
		FROM products
		WHERE handle = $1
		ORDER BY region`

	rows, err := c.pool.Query(ctx, query, handle)
	if err != nil {
		return nil, fmt.Errorf("failed to query products by handle: %w", err)
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
		); err != nil {
			return nil, fmt.Errorf("failed to scan product: %w", err)
		}
		products = append(products, p)
	}

	return products, nil
}
