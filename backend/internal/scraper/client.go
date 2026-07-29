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

const (
	// pageLimit is Shopify's maximum page size for products.json
	pageLimit = 250
	// maxPages caps pagination as a runaway guard (250 * 40 = 10k products)
	maxPages = 40
	// maxRetries per page fetch
	maxRetries = 3
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

// FetchProducts fetches the full catalog from a region's Shopify store,
// walking every page of products.json until exhausted.
func (c *Client) FetchProducts(ctx context.Context, region Region) ([]models.ShopifyProduct, error) {
	var all []models.ShopifyProduct
	seen := make(map[int64]bool)

	for page := 1; page <= maxPages; page++ {
		products, err := c.fetchPage(ctx, region, page)
		if err != nil {
			// A failure on the first page means the region is unreachable;
			// a failure mid-pagination keeps what we already have.
			if page == 1 {
				return nil, err
			}
			log.Warn().Err(err).
				Str("region", region.Code).
				Int("page", page).
				Msg("Pagination stopped early, keeping partial catalog")
			break
		}

		// Dedupe across pages — Shopify pagination can shift while walking
		added := 0
		for _, p := range products {
			if !seen[p.ID] {
				seen[p.ID] = true
				all = append(all, p)
				added++
			}
		}

		if len(products) < pageLimit {
			break // last page
		}

		// A store that ignores ?page returns the same items forever; without
		// this the loop would burn the whole page budget hammering it.
		if added == 0 {
			log.Warn().
				Str("region", region.Code).
				Int("page", page).
				Msg("Page returned no new products, stopping pagination")
			break
		}

		c.Sleep()
	}

	// Optional vendor filter (e.g. DSM Singapore stocks many brands).
	// Matching is accent- and case-insensitive — see Region.MatchesVendor.
	if region.VendorFilter != "" {
		filtered := all[:0]
		dropped := 0
		for _, p := range all {
			if region.MatchesVendor(p.Vendor) {
				filtered = append(filtered, p)
			} else {
				dropped++
			}
		}
		log.Debug().
			Str("region", region.Code).
			Int("kept", len(filtered)).
			Int("dropped", dropped).
			Msg("Vendor filter applied")
		all = filtered
	}

	log.Debug().
		Str("region", region.Code).
		Int("count", len(all)).
		Msg("Catalog fetched")

	return all, nil
}

// fetchPage fetches a single page with retry and exponential backoff.
func (c *Client) fetchPage(ctx context.Context, region Region, page int) ([]models.ShopifyProduct, error) {
	url := region.ProductsPageURL(page)

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		products, retryable, err := c.doFetch(ctx, region, url)
		if err == nil {
			return products, nil
		}
		lastErr = err
		if !retryable || attempt == maxRetries {
			break
		}

		backoff := time.Duration(1<<attempt) * time.Second // 2s, 4s
		log.Warn().Err(err).
			Str("region", region.Code).
			Int("page", page).
			Int("attempt", attempt).
			Dur("backoff", backoff).
			Msg("Fetch failed, retrying")

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, lastErr
}

// doFetch performs one HTTP request. The second return value reports whether
// the error is worth retrying (network errors, 429/430, 5xx).
func (c *Client) doFetch(ctx context.Context, region Region, url string) ([]models.ShopifyProduct, bool, error) {
	log.Debug().
		Str("region", region.Code).
		Str("url", url).
		Msg("Fetching products page")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, false, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "curl/7.88.1")
	req.Header.Set("Accept", "*/*")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, true, fmt.Errorf("failed to fetch products: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// 429 (rate limited), 430 (Shopify security), and 5xx are transient
		retryable := resp.StatusCode == http.StatusTooManyRequests ||
			resp.StatusCode == 430 ||
			resp.StatusCode >= 500
		return nil, retryable, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, true, fmt.Errorf("failed to read response body: %w", err)
	}

	var response models.ShopifyProductsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, false, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return response.Products, false, nil
}

// Sleep waits for the configured delay between requests
func (c *Client) Sleep() {
	if c.delay > 0 {
		time.Sleep(c.delay)
	}
}
