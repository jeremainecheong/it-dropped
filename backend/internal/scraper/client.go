package scraper

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/models"
)

const (
	// pageLimit is Shopify's maximum page size for products.json
	pageLimit = 250
	// maxPages caps pagination as a runaway guard (250 * 40 = 10k products)
	maxPages = 40
	// maxRetries per page fetch. The stores answer 429 to a burst from a single
	// address and clear it within seconds, so the budget has to outlast the
	// limiter. Three attempts over ~6s expired inside it and reported the store
	// unreachable: on the run that prompted this, five of six regions gave up
	// while the sixth got through — at the moment the other five stopped.
	maxRetries = 6
	// backoffCap bounds one wait between attempts.
	backoffCap = 30 * time.Second
	// retryAfterCap bounds how long a server-supplied Retry-After can hold the
	// job. Beyond this the store is not rate-limiting us, it is refusing us,
	// and the run should say so rather than sit out its whole CI timeout.
	retryAfterCap = 60 * time.Second
)

// Client handles HTTP requests to Stüssy stores.
//
// One Client is shared by every region goroutine, which is what makes the
// pacing below work: the limit these stores enforce is per address, not per
// host, so spacing requests has to be a property of the process rather than of
// each region separately.
type Client struct {
	httpClient *http.Client
	userAgent  string
	delay      time.Duration
	// proxyURL, when set, is fetched instead of the store directly, with the
	// region and page as query parameters. See requestURL.
	proxyURL   string
	proxyToken string
	// backoffBase scales the wait between attempts: 2*base, 4*base, 8*base…
	// Only tests move it, so they need not spend real seconds proving that a
	// retry happens.
	backoffBase time.Duration

	mu     sync.Mutex
	nextAt time.Time // earliest instant the next request may leave
}

// NewClient creates a new HTTP client for scraping.
//
// proxyURL and proxyToken are optional. Set, every store fetch goes through
// that endpoint instead of straight to the store — which is how this runs in
// CI, because the stores rate limit GitHub's runner addresses on sight. Unset,
// the stores are fetched directly, which is what a local run wants.
func NewClient(timeout, delay time.Duration, proxyURL, proxyToken string) *Client {
	return &Client{
		proxyURL:   strings.TrimSpace(proxyURL),
		proxyToken: strings.TrimSpace(proxyToken),
		httpClient: &http.Client{
			Timeout: timeout,
		},
		// A datacentre address asking for products.json as `curl` is the exact
		// shape a bot wall is looking for, and CI runs from a datacentre.
		userAgent:   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		delay:       delay,
		backoffBase: time.Second,
	}
}

// gate blocks until this request is allowed to leave, then reserves the next
// slot. Regions are scraped concurrently, so without it all six first pages
// leave inside the same second — which is precisely the burst the stores
// answer with 429.
func (c *Client) gate(ctx context.Context) error {
	c.mu.Lock()
	now := time.Now()
	if c.nextAt.Before(now) {
		c.nextAt = now
	}
	wait := c.nextAt.Sub(now)
	c.nextAt = c.nextAt.Add(c.delay)
	c.mu.Unlock()

	if wait <= 0 {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(wait):
		return nil
	}
}

// penalise pushes the shared gate out by d. A 429 is a fact about the address,
// not about the region that happened to receive it: every other region in
// flight is sharing the limit that produced it, and letting them carry on at
// full rate is what keeps the limit closed.
func (c *Client) penalise(d time.Duration) {
	until := time.Now().Add(d)
	c.mu.Lock()
	if c.nextAt.Before(until) {
		c.nextAt = until
	}
	c.mu.Unlock()
}

// PartialCatalogError reports that pagination stopped on an error partway
// through a region. The products fetched so far are still returned and still
// worth writing — they are real listings, and the diff never infers a sold-out
// from a product's absence — but the region has not been seen in full, so the
// run must not report it as a success.
type PartialCatalogError struct {
	Region string
	Pages  int // pages successfully read before the stop
	Err    error
}

func (e *PartialCatalogError) Error() string {
	return fmt.Sprintf("partial catalogue: stopped after %d page(s): %v", e.Pages, e.Err)
}

func (e *PartialCatalogError) Unwrap() error { return e.Err }

// FetchProducts fetches the full catalog from a region's Shopify store,
// walking every page of products.json until exhausted.
//
// A *PartialCatalogError comes back alongside a non-empty product slice when
// pagination stopped early; any other error means nothing usable was fetched.
func (c *Client) FetchProducts(ctx context.Context, region Region) ([]models.ShopifyProduct, error) {
	var all []models.ShopifyProduct
	seen := make(map[int64]bool)
	var partial error

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
			partial = &PartialCatalogError{Region: region.Code, Pages: page - 1, Err: err}
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

	return all, partial
}

// retryPlan says what to do about a failed request.
type retryPlan struct {
	retryable   bool
	rateLimited bool          // the failure was a 429/430, i.e. about our address
	after       time.Duration // server-supplied Retry-After, zero if absent
}

// requestURL is where a page is actually fetched from: the store, or the
// proxy standing in front of it. The proxy takes a region code rather than a
// URL — it resolves the store itself, so that no input reaches it that could
// point it at another host.
func (c *Client) requestURL(region Region, page int) string {
	if c.proxyURL == "" {
		return region.ProductsPageURL(page)
	}
	sep := "?"
	if strings.Contains(c.proxyURL, "?") {
		sep = "&"
	}
	return fmt.Sprintf("%s%sregion=%s&page=%d", c.proxyURL, sep, url.QueryEscape(region.Code), page)
}

// fetchPage fetches a single page with retry and exponential backoff.
func (c *Client) fetchPage(ctx context.Context, region Region, page int) ([]models.ShopifyProduct, error) {
	target := c.requestURL(region, page)

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if err := c.gate(ctx); err != nil {
			return nil, err
		}

		products, plan, err := c.doFetch(ctx, region, target)
		if err == nil {
			return products, nil
		}
		lastErr = err
		if !plan.retryable || attempt == maxRetries {
			break
		}

		backoff := c.backoffFor(attempt, plan.after)

		// Sleeping past the cycle's own deadline buys nothing and costs the
		// diagnosis: the context cancels mid-sleep and the region reports a
		// cancellation instead of the rate limit that actually stopped it.
		if deadline, ok := ctx.Deadline(); ok && time.Now().Add(backoff).After(deadline) {
			lastErr = fmt.Errorf("rate limited, and the next retry (%s) would run past the cycle deadline: %w",
				backoff, lastErr)
			break
		}

		if plan.rateLimited {
			// Hold every region back, not just this one — see penalise.
			c.penalise(backoff)
		}

		// Durations as strings, not zerolog's default float milliseconds: the
		// first log of this working read "backoff=63217.264018", which is a
		// number nobody can act on. The server's own figure is logged beside
		// ours because it is the single most useful fact about a rate limit —
		// whether it clears in two seconds or two minutes — and inferring it
		// from a jittered backoff is guesswork.
		ev := log.Warn().Err(err).
			Str("region", region.Code).
			Int("page", page).
			Int("attempt", attempt).
			Str("backoff", backoff.String()).
			Bool("rateLimited", plan.rateLimited)
		if plan.after > 0 {
			ev = ev.Str("retryAfter", plan.after.String())
		}
		ev.Msg("Fetch failed, retrying")

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
	}
	return nil, lastErr
}

// backoffFor picks the wait before the next attempt: exponential, never
// shorter than the server asked for, jittered, and bounded.
func (c *Client) backoffFor(attempt int, serverHint time.Duration) time.Duration {
	d := time.Duration(1<<attempt) * c.backoffBase // 2s, 4s, 8s, 16s, 32s
	if d > backoffCap {
		d = backoffCap
	}
	// Retry-After is the server telling us when it will listen again; retrying
	// before then is a wasted request that renews the limit.
	if serverHint > d {
		d = min(serverHint, retryAfterCap)
	}
	// Six regions that were rate-limited together would otherwise retry in
	// lockstep and rebuild the burst that limited them.
	if d/4 <= 0 {
		return d
	}
	return d + rand.N(d/4)
}

// retryAfter parses a Retry-After header in either of its forms — delay in
// seconds, or an HTTP date.
func retryAfter(h string) time.Duration {
	h = strings.TrimSpace(h)
	if h == "" {
		return 0
	}
	if secs, err := strconv.Atoi(h); err == nil {
		if secs <= 0 {
			return 0
		}
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(h); err == nil {
		if d := time.Until(t); d > 0 {
			return d
		}
	}
	return 0
}

// doFetch performs one HTTP request. The returned plan reports whether the
// error is worth retrying (network errors, 429/430, 5xx) and how long to wait.
func (c *Client) doFetch(ctx context.Context, region Region, url string) ([]models.ShopifyProduct, retryPlan, error) {
	log.Debug().
		Str("region", region.Code).
		Str("url", url).
		Msg("Fetching products page")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, retryPlan{}, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	// Guarded on proxyURL as well as on the token: with no proxy configured the
	// request goes straight to a storefront, and that is not somewhere to send
	// a bearer token.
	if c.proxyURL != "" && c.proxyToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.proxyToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, retryPlan{retryable: true}, fmt.Errorf("failed to fetch products: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// 429 (rate limited), 430 (Shopify security), and 5xx are transient
		limited := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == 430
		plan := retryPlan{
			retryable:   limited || resp.StatusCode >= 500,
			rateLimited: limited,
			after:       retryAfter(resp.Header.Get("Retry-After")),
		}
		return nil, plan, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, retryPlan{retryable: true}, fmt.Errorf("failed to read response body: %w", err)
	}

	var response models.ShopifyProductsResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, retryPlan{}, fmt.Errorf("failed to parse JSON: %w", err)
	}

	return response.Products, retryPlan{}, nil
}
