package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/models"
)

// Client handles HTTP requests to Stüssy stores
type Client struct {
	httpClient *http.Client
	userAgent  string
	delay      time.Duration
}

// NewClient creates a new HTTP client for scraping
func NewClient(timeout, delay time.Duration) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: timeout,
		},
		userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		delay:     delay,
	}
}

// FetchProducts fetches products from a region's Shopify store
func (c *Client) FetchProducts(ctx context.Context, region Region) ([]models.ShopifyProduct, error) {
	url := region.ProductsURL()

	log.Debug().
		Str("region", region.Code).
		Str("url", url).
		Msg("Fetching products")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "curl/7.88.1")
	req.Header.Set("Accept", "*/*")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch products: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var response models.ShopifyProductsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	var products []models.ShopifyProduct
	if region.VendorFilter != "" {
		// Filter by vendor
		for _, p := range response.Products {
			if p.Vendor == region.VendorFilter {
				products = append(products, p)
			}
		}
	} else {
		products = response.Products
	}

	log.Debug().
		Str("region", region.Code).
		Int("original_count", len(response.Products)).
		Int("filtered_count", len(products)).
		Msg("Products fetched successfully")

	return products, nil
}

// Sleep waits for the configured delay between requests
func (c *Client) Sleep() {
	if c.delay > 0 {
		time.Sleep(c.delay)
	}
}
