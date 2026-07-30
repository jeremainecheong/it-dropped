package scraper

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// testClient is a Client wired to a test server, with the retry waits scaled
// down so a test that proves a retry happens does not spend six real seconds
// doing it.
func testClient(srv *httptest.Server, delay time.Duration) (*Client, Region) {
	c := NewClient(5*time.Second, delay, "", "")
	c.backoffBase = time.Millisecond
	return c, Region{Code: "test", Name: "Test", BaseURL: srv.URL, Currency: "USD"}
}

// productsJSON renders n products as Shopify would.
func productsJSON(startID int64, n int) string {
	var b strings.Builder
	b.WriteString(`{"products":[`)
	for i := 0; i < n; i++ {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, `{"id":%d,"title":"P%d","handle":"p%d","vendor":"Stussy","variants":[],"images":[]}`,
			startID+int64(i), i, i)
	}
	b.WriteString(`]}`)
	return b.String()
}

// The run that prompted this returned 429 to five of six regions on their very
// first request and gave up inside six seconds. A limiter that clears must not
// be reported as an unreachable store.
func TestFetchProductsSurvivesRateLimit(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= 4 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		fmt.Fprint(w, productsJSON(1, 3))
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	products, err := c.FetchProducts(context.Background(), region)
	if err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
	if len(products) != 3 {
		t.Fatalf("got %d products, want 3", len(products))
	}
	if got := calls.Load(); got != 5 {
		t.Fatalf("made %d requests, want 5 (4 rate-limited + 1 success)", got)
	}
}

// 430 is Shopify's own "request blocked" and clears the same way a 429 does.
func TestFetchProductsRetries430(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(430)
			return
		}
		fmt.Fprint(w, productsJSON(1, 1))
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	if _, err := c.FetchProducts(context.Background(), region); err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
}

// A 404 is the store saying the endpoint is not there. Retrying it five more
// times is six wasted requests against an address that is already suspect.
func TestFetchProductsDoesNotRetryClientErrors(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	if _, err := c.FetchProducts(context.Background(), region); err == nil {
		t.Fatal("want an error for a 404 store")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("made %d requests, want 1", got)
	}
}

// Pagination that stops on an error keeps what it read, and says so: the
// caller writes the products and still marks the region failed.
func TestFetchProductsReportsPartialCatalog(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("page") == "1" {
			fmt.Fprint(w, productsJSON(1, pageLimit))
			return
		}
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	products, err := c.FetchProducts(context.Background(), region)

	var partial *PartialCatalogError
	if !errors.As(err, &partial) {
		t.Fatalf("got error %v, want *PartialCatalogError", err)
	}
	if partial.Pages != 1 {
		t.Fatalf("partial.Pages = %d, want 1", partial.Pages)
	}
	if len(products) != pageLimit {
		t.Fatalf("got %d products, want the %d already read", len(products), pageLimit)
	}
}

// A full catalogue must not come back wrapped in a partial error — the typed
// nil is exactly the trap this guards.
func TestFetchProductsCompleteHasNoError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, productsJSON(1, 10))
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	if _, err := c.FetchProducts(context.Background(), region); err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
}

// The gate is what stops six regions putting six first pages on the wire
// inside the same second.
func TestGateSpacesConcurrentRequests(t *testing.T) {
	const (
		regions = 6
		delay   = 20 * time.Millisecond
	)

	var mu sync.Mutex
	var times []time.Time
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		times = append(times, time.Now())
		mu.Unlock()
		fmt.Fprint(w, productsJSON(1, 1))
	}))
	defer srv.Close()

	c, region := testClient(srv, delay)

	var wg sync.WaitGroup
	for i := 0; i < regions; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.FetchProducts(context.Background(), region); err != nil {
				t.Errorf("FetchProducts: %v", err)
			}
		}()
	}
	wg.Wait()

	if len(times) != regions {
		t.Fatalf("saw %d requests, want %d", len(times), regions)
	}
	// The spread must cover the reserved slots, which it cannot if the requests
	// all left together. Asserted at 80% of the exact span: the timestamps are
	// taken inside the handler, so a few milliseconds of scheduler slop either
	// way is normal, and the distinction being drawn here is against a burst
	// that spans approximately nothing.
	first, last := times[0], times[0]
	for _, ts := range times {
		if ts.Before(first) {
			first = ts
		}
		if ts.After(last) {
			last = ts
		}
	}
	if want := time.Duration(regions-1) * delay * 8 / 10; last.Sub(first) < want {
		t.Fatalf("requests spanned %v, want at least %v", last.Sub(first), want)
	}
}

// A 429 against one region has to slow every region down: the limit is on the
// address, and the other five carrying on at full rate is what keeps it shut.
func TestPenaliseHoldsBackEveryRegion(t *testing.T) {
	c, _ := testClient(httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})), 0)
	c.penalise(80 * time.Millisecond)

	start := time.Now()
	if err := c.gate(context.Background()); err != nil {
		t.Fatalf("gate: %v", err)
	}
	if waited := time.Since(start); waited < 60*time.Millisecond {
		t.Fatalf("gate returned after %v, want it held for the penalty", waited)
	}
}

func TestRetryAfter(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   time.Duration
	}{
		{"absent", "", 0},
		{"seconds", "12", 12 * time.Second},
		{"padded", "  3 ", 3 * time.Second},
		{"zero", "0", 0},
		{"negative", "-5", 0},
		{"past date", "Mon, 02 Jan 2006 15:04:05 GMT", 0},
		{"nonsense", "soon", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := retryAfter(tt.header); got != tt.want {
				t.Fatalf("retryAfter(%q) = %v, want %v", tt.header, got, tt.want)
			}
		})
	}

	// An HTTP-date in the future resolves to the interval until it.
	got := retryAfter(time.Now().Add(30 * time.Second).UTC().Format(http.TimeFormat))
	if got < 25*time.Second || got > 30*time.Second {
		t.Fatalf("retryAfter(future date) = %v, want ~30s", got)
	}
}

// Retrying before the server said it would listen again is a wasted request
// that renews the limit that produced the header.
func TestBackoffHonoursRetryAfter(t *testing.T) {
	c := NewClient(time.Second, 0, "", "")

	if got := c.backoffFor(1, 20*time.Second); got < 20*time.Second {
		t.Fatalf("backoffFor(1, 20s) = %v, want at least 20s", got)
	}
	// A short hint must not shorten an already-long exponential wait.
	if got := c.backoffFor(4, time.Second); got < 16*time.Second {
		t.Fatalf("backoffFor(4, 1s) = %v, want at least the 16s exponential", got)
	}
	// Neither the exponential nor an outlandish hint may hold the job forever.
	if got := c.backoffFor(10, time.Hour); got > retryAfterCap+retryAfterCap/4 {
		t.Fatalf("backoffFor(10, 1h) = %v, want it bounded", got)
	}
}

// The default identifies as a browser. A datacentre address asking for
// products.json as curl is the shape a bot wall looks for, and CI is a
// datacentre.
func TestRequestSendsConfiguredUserAgent(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("User-Agent")
		fmt.Fprint(w, productsJSON(1, 1))
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	if _, err := c.FetchProducts(context.Background(), region); err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
	if got != c.userAgent {
		t.Fatalf("User-Agent = %q, want %q", got, c.userAgent)
	}
	if strings.Contains(strings.ToLower(got), "curl") {
		t.Fatalf("User-Agent = %q, which is what a bot wall filters on", got)
	}
}

// With a proxy configured, the store is never contacted directly: the proxy is
// fetched instead, and told which region and page by name. It resolves the
// storefront itself, so there is no input that could point it at another host.
func TestProxyIsFetchedInsteadOfTheStore(t *testing.T) {
	var gotPath, gotAuth string
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.String()
		gotAuth = r.Header.Get("Authorization")
		fmt.Fprint(w, productsJSON(1, 2))
	}))
	defer proxy.Close()

	var storeHits atomic.Int32
	store := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		storeHits.Add(1)
		fmt.Fprint(w, productsJSON(99, 1))
	}))
	defer store.Close()

	c := NewClient(5*time.Second, 0, proxy.URL+"/api/scrape/store", "s3cret")
	c.backoffBase = time.Millisecond
	region := Region{Code: "us", Name: "US", BaseURL: store.URL, Currency: "USD"}

	products, err := c.FetchProducts(context.Background(), region)
	if err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
	if len(products) != 2 {
		t.Fatalf("got %d products, want the proxy's 2", len(products))
	}
	if storeHits.Load() != 0 {
		t.Fatalf("store was contacted %d times, want 0", storeHits.Load())
	}
	if want := "/api/scrape/store?region=us&page=1"; gotPath != want {
		t.Fatalf("proxy path = %q, want %q", gotPath, want)
	}
	if want := "Bearer s3cret"; gotAuth != want {
		t.Fatalf("Authorization = %q, want %q", gotAuth, want)
	}
}

// A proxy URL that already carries a query string must gain parameters, not a
// second '?'.
func TestProxyURLWithExistingQuery(t *testing.T) {
	c := NewClient(time.Second, 0, "https://example.test/p?v=1", "t")
	region := Region{Code: "jp"}
	if got, want := c.requestURL(region, 3), "https://example.test/p?v=1&region=jp&page=3"; got != want {
		t.Fatalf("requestURL = %q, want %q", got, want)
	}
}

// Without a proxy the request goes straight to a storefront, which is not
// somewhere to send a bearer token — even if one is somehow configured.
func TestNoProxyMeansNoAuthorizationHeader(t *testing.T) {
	var sawAuth bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization") != ""
		fmt.Fprint(w, productsJSON(1, 1))
	}))
	defer srv.Close()

	c := NewClient(5*time.Second, 0, "", "leaked-if-sent")
	region := Region{Code: "us", BaseURL: srv.URL}
	if _, err := c.FetchProducts(context.Background(), region); err != nil {
		t.Fatalf("FetchProducts: %v", err)
	}
	if sawAuth {
		t.Fatal("sent an Authorization header to a storefront")
	}
}

// A status code alone does not say why a request was refused. The proxy in
// front of these stores distinguishes "no token configured on the deployment"
// from "token mismatch" in the body, and that distinction is worth surfacing.
func TestErrorCarriesTheResponseBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"error":"unauthorised: token mismatch"}`)
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	_, err := c.FetchProducts(context.Background(), region)
	if err == nil {
		t.Fatal("want an error")
	}
	if !strings.Contains(err.Error(), "token mismatch") {
		t.Fatalf("error = %q, want it to carry the response body", err)
	}
}

// A bot wall answers with a whole HTML page. Enough of it to recognise, not
// enough to bury the log.
func TestErrorBodyIsBounded(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "<html>\n<body>\n"+strings.Repeat("blocked ", 500)+"</body>\n</html>")
	}))
	defer srv.Close()

	c, region := testClient(srv, 0)
	_, err := c.FetchProducts(context.Background(), region)
	if err == nil {
		t.Fatal("want an error")
	}
	if len(err.Error()) > 300 {
		t.Fatalf("error is %d chars, want it bounded", len(err.Error()))
	}
	if strings.ContainsAny(err.Error(), "\n\r") {
		t.Fatalf("error spans lines: %q", err)
	}
}

// Pagination that stops early must SAY so, whatever stopped it. Delisting
// detection marks every product it did not see as gone, gated only on this
// signal — so a truncation reported as a complete catalogue would flip a whole
// region to unavailable.
func TestSilentTruncationsReportPartial(t *testing.T) {
	t.Run("store ignores ?page", func(t *testing.T) {
		// Always returns the same full page: `added == 0` on the second request.
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, productsJSON(1, pageLimit))
		}))
		defer srv.Close()

		c, region := testClient(srv, 0)
		products, err := c.FetchProducts(context.Background(), region)

		var partial *PartialCatalogError
		if !errors.As(err, &partial) {
			t.Fatalf("got error %v, want *PartialCatalogError — a repeated page is a truncation", err)
		}
		if len(products) != pageLimit {
			t.Fatalf("got %d products, want the %d actually read", len(products), pageLimit)
		}
	})

	t.Run("pagination cap reached", func(t *testing.T) {
		// Every page full and every page distinct, so the walk only ends when
		// it runs out of page budget.
		var page int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			n := atomic.AddInt32(&page, 1)
			fmt.Fprint(w, productsJSON(int64(n)*10_000, pageLimit))
		}))
		defer srv.Close()

		c, region := testClient(srv, 0)
		products, err := c.FetchProducts(context.Background(), region)

		var partial *PartialCatalogError
		if !errors.As(err, &partial) {
			t.Fatalf("got error %v, want *PartialCatalogError at the page cap", err)
		}
		if len(products) != maxPages*pageLimit {
			t.Fatalf("got %d products, want %d", len(products), maxPages*pageLimit)
		}
	})
}
