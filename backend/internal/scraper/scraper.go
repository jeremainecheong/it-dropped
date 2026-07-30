package scraper

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
	"github.com/yourusername/dropradar/internal/models"
)

// Scraper orchestrates the scraping process
type Scraper struct {
	cfg    *config.Config
	db     *database.Client
	client *Client
}

// New creates a new Scraper instance
func New(cfg *config.Config, db *database.Client) *Scraper {
	return &Scraper{
		cfg:    cfg,
		db:     db,
		client: NewClient(cfg.ScrapeTimeout, cfg.RequestDelay, cfg.ScrapeProxyURL, cfg.ScrapeProxyToken),
	}
}

// Run executes the scraping process for all configured regions.
//
// Regions are independent Shopify stores and are scraped concurrently, but
// they are not independent to the stores: the rate limit is on our address, so
// six regions at full tilt is one client at six times the rate. The shared
// Client paces and backs off across all of them — see scraper.Client.
//
// A region that fails is reported in the returned error rather than only
// logged. The scraper runs unattended once a day from .github/workflows/
// scrape.yml, and a job that exits 0 is a job nobody looks at: every failure
// mode that mattered here — an unreachable store, a write that errored for
// every product, a misspelt region code — used to leave a green run behind it.
func (s *Scraper) Run(ctx context.Context) error {
	regions := s.cfg.GetRegions()

	log.Info().
		Strs("regions", regions).
		Msg("Starting scraper")

	var (
		mu                                                      sync.Mutex
		wg                                                      sync.WaitGroup
		totalNew, totalRestock, totalPriceChanges, totalSoldOut int
		failures                                                []string
		attempted                                               int
	)

	recordFailure := func(code string, err error) {
		mu.Lock()
		defer mu.Unlock()
		failures = append(failures, fmt.Sprintf("%s: %v", code, err))
	}

	for _, regionCode := range regions {
		// REGIONS is a comma-separated env var, so "us, uk" is an easy thing
		// to write and used to produce an unknown region for " uk".
		regionCode = strings.TrimSpace(regionCode)
		if regionCode == "" {
			continue
		}

		attempted++

		region := GetRegion(regionCode)
		if region == nil {
			// Previously a warning that scrolled past. A region named in
			// REGIONS that this binary cannot resolve scrapes nothing, which
			// is the same outcome as a region that failed outright.
			log.Error().Str("region", regionCode).Msg("Unknown region, skipping")
			recordFailure(regionCode, fmt.Errorf("unknown region code"))
			continue
		}

		wg.Add(1)
		go func(region Region) {
			defer wg.Done()

			newCount, restockCount, priceChanges, soldOut, err := s.scrapeRegion(ctx, region)
			if err != nil {
				log.Error().Err(err).Str("region", region.Code).Msg("Failed to scrape region")
				recordFailure(region.Code, err)
				return
			}

			mu.Lock()
			totalNew += newCount
			totalRestock += restockCount
			totalPriceChanges += priceChanges
			totalSoldOut += soldOut
			mu.Unlock()
		}(*region)
	}

	wg.Wait()

	log.Info().
		Int("new", totalNew).
		Int("restocks", totalRestock).
		Int("priceChanges", totalPriceChanges).
		Int("soldOut", totalSoldOut).
		Int("regions", attempted).
		Int("failedRegions", len(failures)).
		Msg("Scraping completed")

	if attempted == 0 {
		return fmt.Errorf("no regions configured: REGIONS resolved to nothing")
	}

	if len(failures) > 0 {
		// Sorted so the message is stable across runs — the goroutines finish
		// in whatever order the network allows.
		sort.Strings(failures)
		return fmt.Errorf("%d of %d region(s) failed: %s",
			len(failures), attempted, strings.Join(failures, "; "))
	}

	return nil
}

// scrapeRegion scrapes a single region
func (s *Scraper) scrapeRegion(ctx context.Context, region Region) (newCount, restockCount, priceChanges, soldOutCount int, err error) {
	// Create scrape log
	scrapeLog, err := s.db.CreateScrapeLog(ctx, region.Code)
	if err != nil {
		return 0, 0, 0, 0, err
	}

	startTime := time.Now()

	defer func() {
		// Complete scrape log
		scrapeLog.DurationMs = int(time.Since(startTime).Milliseconds())
		if err != nil {
			scrapeLog.Status = models.ScrapeStatusFailed
			scrapeLog.ErrorMessage = err.Error()
		} else {
			scrapeLog.Status = models.ScrapeStatusSuccess
		}
		scrapeLog.NewCount = newCount
		scrapeLog.RestockCount = restockCount
		scrapeLog.PriceChanges = priceChanges

		if logErr := s.db.CompleteScrapeLog(ctx, scrapeLog); logErr != nil {
			log.Error().Err(logErr).Msg("Failed to complete scrape log")
		}
	}()

	log.Info().Str("region", region.Code).Msg("Scraping region")

	// Fetch products from API.
	//
	// A partial catalogue is kept and written: those listings are real, and the
	// diff never reads a product's absence as a sold-out, so half a region is
	// strictly better than none of it. The error is held back and returned at
	// the end, which marks the region failed without discarding the work — a
	// truncated region that reports success is how a store silently stops being
	// covered.
	shopifyProducts, err := s.client.FetchProducts(ctx, region)
	var partial *PartialCatalogError
	if err != nil {
		if !errors.As(err, &partial) {
			return 0, 0, 0, 0, err
		}
		err = nil
	}

	scrapeLog.ProductsFound = len(shopifyProducts)

	// A live storefront is never empty. Zero products with no error is what a
	// moved products.json, a bot wall answering 200 with an empty list, or a
	// vendor filter that stopped matching all look like — and every step below
	// would then be a perfectly successful no-op over an empty slice.
	if len(shopifyProducts) == 0 {
		err = fmt.Errorf("store returned 0 products")
		return 0, 0, 0, 0, err
	}

	// ---- phase 1: fingerprints only ------------------------------------
	// All the diff needs to decide "did this product change?" is the stored
	// hash. Reading the full row for all several-thousand products, of which
	// a typical day changes a handful, is the expensive part of a cycle.
	existingHashes, err := s.db.GetProductHashesByRegion(ctx, region.Code)
	if err != nil {
		return 0, 0, 0, 0, err
	}

	// Parse and fingerprint everything the store gave us.
	parsed := make([]models.Product, 0, len(shopifyProducts))
	for _, sp := range shopifyProducts {
		product := Parse(sp, region)
		product.LastHash = GenerateHash(&product)
		parsed = append(parsed, product)
	}

	// Split on the fingerprint. Unchanged rows want nothing but a cheap batch
	// last_seen_at touch; changed rows are the only ones worth reading in
	// full, diffing, or upserting.
	//
	// Products whose hash is unchanged are deliberately not passed to
	// DetectChanges: every field it compares — price, availability, the size
	// run — is part of the hash, so an unchanged fingerprint cannot yield a
	// drop. Nor can they be omitted from the map instead of the slice, since
	// DetectChanges reads "not in the old map" as a brand new listing.
	changed := make([]models.Product, 0, len(parsed))
	var changedExistingIDs []int64
	var unchangedIDs []int64
	for i := range parsed {
		p := &parsed[i]
		old, exists := existingHashes[p.ShopifyID]
		if exists {
			// Keep identity for downstream drop linkage, on both branches.
			p.ID = old.ID
		}

		if exists && old.LastHash == p.LastHash {
			unchangedIDs = append(unchangedIDs, p.ShopifyID)
			continue
		}

		changed = append(changed, *p)
		if exists {
			changedExistingIDs = append(changedExistingIDs, p.ShopifyID)
		}
	}

	// ---- phase 2: full rows for the changed subset ----------------------
	// DetectChanges needs the previous price and size run, which phase 1 did
	// not read. Fetch those columns now, for these products only.
	existingProducts, err := s.db.GetProductsByShopifyIDs(ctx, region.Code, changedExistingIDs)
	if err != nil {
		return 0, 0, 0, 0, err
	}

	// Phase 1 said these rows exist; if phase 2 cannot see them the two reads
	// disagree and every missing product would be reported as a brand new
	// listing — 6,000 spurious "new drop" notifications is a worse outcome
	// than a failed cycle.
	if len(existingProducts) != len(changedExistingIDs) {
		err = fmt.Errorf("phase 2 read %d of %d changed products; refusing to treat the rest as new",
			len(existingProducts), len(changedExistingIDs))
		return 0, 0, 0, 0, err
	}

	log.Debug().
		Str("region", region.Code).
		Int("catalogue", len(parsed)).
		Int("stored", len(existingHashes)).
		Int("changed", len(changed)).
		Int("unchanged", len(unchangedIDs)).
		Msg("Two-phase diff")

	// Detect changes
	drops := DetectChanges(existingProducts, changed)

	// Count changes by type
	for _, drop := range drops {
		switch drop.ChangeType {
		case models.ChangeTypeNew:
			newCount++
		case models.ChangeTypeRestock, models.ChangeTypeSizeRestock:
			restockCount++
		case models.ChangeTypePriceDrop, models.ChangeTypePriceIncrease:
			priceChanges++
		case models.ChangeTypeSoldOut, models.ChangeTypeSizeSoldOut:
			soldOutCount++
		}
	}

	// Write only what changed: unchanged rows (same hash) get a cheap batch
	// last_seen_at touch instead of a full upsert.
	//
	// `changed` must not be appended to from here on: the drop linkage below
	// takes the address of its elements, and a reallocation would leave those
	// pointers aimed at the old backing array.
	var upserted, writeFailures int
	var writeErr error
	for i := range changed {
		p := &changed[i]

		if upsertErr := s.db.UpsertProduct(ctx, p); upsertErr != nil {
			writeFailures++
			if writeErr == nil {
				writeErr = upsertErr
			}
			log.Error().Err(upsertErr).
				Int64("shopifyID", p.ShopifyID).
				Msg("Failed to upsert product")
			continue
		}
		upserted++

		// Price history is not written here: 004 puts on_product_insert and
		// on_product_price_change on the products table, so the upsert above
		// has already appended a row. Recording it again from Go would double
		// every point on the product-page chart.
	}

	touched := 0
	if len(unchangedIDs) > 0 {
		if touchErr := s.db.TouchProducts(ctx, region.Code, unchangedIDs); touchErr != nil {
			log.Error().Err(touchErr).Str("region", region.Code).Msg("Failed to touch unchanged products")
			if writeErr == nil {
				writeErr = touchErr
			}
		} else {
			touched = len(unchangedIDs)
		}
	}

	// The catalogue once sat frozen for six months because every product write
	// raised the same error, the error was logged per-product, and the cycle
	// went on to report success. A region that fetched a catalogue and then
	// persisted none of it has failed, however many individual log lines say so.
	if upserted == 0 && touched == 0 && writeErr != nil {
		err = fmt.Errorf("no product writes succeeded (%d failed): %w", writeFailures, writeErr)
		return
	}

	if writeFailures > 0 {
		log.Warn().
			Str("region", region.Code).
			Int("failed", writeFailures).
			Int("upserted", upserted).
			Err(writeErr).
			Msg("Some product writes failed")
	}

	log.Debug().
		Str("region", region.Code).
		Int("upserted", upserted).
		Int("skipped", len(unchangedIDs)).
		Msg("Product writes")

	// Create drops
	byShopifyID := make(map[int64]*models.Product, len(changed))
	for i := range changed {
		byShopifyID[changed[i].ShopifyID] = &changed[i]
	}

	for i := range drops {
		// Find the product ID for this drop
		p, ok := byShopifyID[drops[i].ShopifyID]
		if !ok || p.ID == uuid.Nil {
			// The upsert for this product failed above, so there is no row for
			// the drop's product_id foreign key to point at. Dropping the link
			// rather than writing a dangling one also keeps MatchAlerts from
			// firing on a product that was never stored; the change is still
			// pending in the catalogue and will be detected again next cycle.
			drops[i].ProductID = nil
			log.Warn().
				Int64("shopifyID", drops[i].ShopifyID).
				Str("type", string(drops[i].ChangeType)).
				Msg("Skipping drop for a product that failed to write")
			continue
		}
		drops[i].ProductID = &p.ID

		if err := s.db.CreateDrop(ctx, &drops[i]); err != nil {
			log.Error().Err(err).
				Str("type", string(drops[i].ChangeType)).
				Str("title", drops[i].Title).
				Msg("Failed to create drop")
		}
	}

	// Fire any user alerts these drops satisfy. This is what makes the web
	// app's notification bell ring; without it, alerts could be created but
	// never delivered.
	if len(drops) > 0 {
		if n, err := s.db.MatchAlerts(ctx, drops); err != nil {
			log.Error().Err(err).Str("region", region.Code).Msg("Failed to match alerts")
		} else if n > 0 {
			log.Info().Str("region", region.Code).Int("notifications", n).Msg("User alerts fired")
		}
	}

	// Re-arm restock alerts on anything that has gone out of stock, so a user
	// keeps being told about future restocks rather than only the first.
	//
	// Only `changed` is scanned: is_available is part of the hash, so a product
	// that just went out of stock cannot be on the unchanged side of the split.
	for i := range changed {
		p := &changed[i]
		if p.IsAvailable || p.ID == uuid.Nil {
			continue
		}
		if old, ok := existingProducts[p.ShopifyID]; ok && old.IsAvailable {
			if err := s.db.ReArmAlerts(ctx, p.ID, p.IsAvailable); err != nil {
				log.Error().Err(err).Msg("Failed to re-arm alerts")
			}
		}
	}

	log.Info().
		Str("region", region.Code).
		Int("products", len(parsed)).
		Int("new", newCount).
		Int("restocks", restockCount).
		Int("priceChanges", priceChanges).
		Int("soldOut", soldOutCount).
		Bool("partial", partial != nil).
		Msg("Region scrape completed")

	// Assigned through the typed variable rather than returned directly: a nil
	// *PartialCatalogError returned as an error is not a nil error, and would
	// fail every region.
	if partial != nil {
		err = partial
		return newCount, restockCount, priceChanges, soldOutCount, err
	}

	return newCount, restockCount, priceChanges, soldOutCount, nil
}
