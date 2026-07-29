package scraper

import (
	"context"
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
		client: NewClient(cfg.ScrapeTimeout, cfg.RequestDelay),
	}
}

// Run executes the scraping process for all configured regions.
// Regions are independent Shopify stores, so they are scraped concurrently —
// per-store politeness is preserved by the page delay inside each region.
func (s *Scraper) Run(ctx context.Context) error {
	regions := s.cfg.GetRegions()

	log.Info().
		Strs("regions", regions).
		Msg("Starting scraper")

	var (
		mu                                                      sync.Mutex
		wg                                                      sync.WaitGroup
		totalNew, totalRestock, totalPriceChanges, totalSoldOut int
	)

	for _, regionCode := range regions {
		region := GetRegion(regionCode)
		if region == nil {
			log.Warn().Str("region", regionCode).Msg("Unknown region, skipping")
			continue
		}

		wg.Add(1)
		go func(region Region) {
			defer wg.Done()

			newCount, restockCount, priceChanges, soldOut, err := s.scrapeRegion(ctx, region)
			if err != nil {
				log.Error().Err(err).Str("region", region.Code).Msg("Failed to scrape region")
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
		Msg("Scraping completed")

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

	// Fetch products from API
	shopifyProducts, err := s.client.FetchProducts(ctx, region)
	if err != nil {
		return 0, 0, 0, 0, err
	}

	scrapeLog.ProductsFound = len(shopifyProducts)

	// Get existing products from database
	existingProducts, err := s.db.GetAllProductsByRegion(ctx, region.Code)
	if err != nil {
		return 0, 0, 0, 0, err
	}

	// Parse and process products
	var newProducts []models.Product
	for _, sp := range shopifyProducts {
		product := Parse(sp, region)
		product.LastHash = GenerateHash(&product)
		newProducts = append(newProducts, product)
	}

	// Detect changes
	drops := DetectChanges(existingProducts, newProducts)

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
	var unchangedIDs []int64
	var upserted, skipped int
	for i := range newProducts {
		p := &newProducts[i]
		if old, exists := existingProducts[p.ShopifyID]; exists && old.LastHash == p.LastHash {
			p.ID = old.ID // keep identity for downstream drop linkage
			unchangedIDs = append(unchangedIDs, p.ShopifyID)
			skipped++
			continue
		}

		old, existed := existingProducts[p.ShopifyID]

		if err := s.db.UpsertProduct(ctx, p); err != nil {
			log.Error().Err(err).
				Int64("shopifyID", p.ShopifyID).
				Msg("Failed to upsert product")
			continue
		}
		upserted++

		// Append to price history on a genuine price move (and once when the
		// product first appears) so the product-page chart has real data.
		if !existed || old.Price != p.Price {
			if err := s.db.RecordPrice(ctx, p.ID, p.Price, p.ComparePrice, p.Currency); err != nil {
				log.Error().Err(err).
					Int64("shopifyID", p.ShopifyID).
					Msg("Failed to record price history")
			}
		}
	}

	if len(unchangedIDs) > 0 {
		if err := s.db.TouchProducts(ctx, region.Code, unchangedIDs); err != nil {
			log.Error().Err(err).Str("region", region.Code).Msg("Failed to touch unchanged products")
		}
	}

	log.Debug().
		Str("region", region.Code).
		Int("upserted", upserted).
		Int("skipped", skipped).
		Msg("Product writes")

	// Create drops
	for i := range drops {
		// Find the product ID for this drop
		for j := range newProducts {
			if newProducts[j].ShopifyID == drops[i].ShopifyID {
				drops[i].ProductID = &newProducts[j].ID
				break
			}
		}

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
	for i := range newProducts {
		p := &newProducts[i]
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
		Int("products", len(newProducts)).
		Int("new", newCount).
		Int("restocks", restockCount).
		Int("priceChanges", priceChanges).
		Int("soldOut", soldOutCount).
		Msg("Region scrape completed")

	return newCount, restockCount, priceChanges, soldOutCount, nil
}
