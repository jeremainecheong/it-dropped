package scraper

import (
	"context"
	"time"

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

// Run executes the scraping process for all configured regions
func (s *Scraper) Run(ctx context.Context) error {
	regions := s.cfg.GetRegions()

	log.Info().
		Strs("regions", regions).
		Msg("Starting scraper")

	var totalNew, totalRestock, totalPriceChanges int

	for _, regionCode := range regions {
		region := GetRegion(regionCode)
		if region == nil {
			log.Warn().Str("region", regionCode).Msg("Unknown region, skipping")
			continue
		}

		newCount, restockCount, priceChanges, err := s.scrapeRegion(ctx, *region)
		if err != nil {
			log.Error().Err(err).Str("region", regionCode).Msg("Failed to scrape region")
			continue
		}

		totalNew += newCount
		totalRestock += restockCount
		totalPriceChanges += priceChanges

		// Delay between regions
		s.client.Sleep()
	}

	log.Info().
		Int("new", totalNew).
		Int("restocks", totalRestock).
		Int("priceChanges", totalPriceChanges).
		Msg("Scraping completed")

	return nil
}

// scrapeRegion scrapes a single region
func (s *Scraper) scrapeRegion(ctx context.Context, region Region) (newCount, restockCount, priceChanges int, err error) {
	// Create scrape log
	scrapeLog, err := s.db.CreateScrapeLog(ctx, region.Code)
	if err != nil {
		return 0, 0, 0, err
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
		return 0, 0, 0, err
	}

	scrapeLog.ProductsFound = len(shopifyProducts)

	// Get existing products from database
	existingProducts, err := s.db.GetAllProductsByRegion(ctx, region.Code)
	if err != nil {
		return 0, 0, 0, err
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
		}
	}

	// Upsert products
	for i := range newProducts {
		if err := s.db.UpsertProduct(ctx, &newProducts[i]); err != nil {
			log.Error().Err(err).
				Int64("shopifyID", newProducts[i].ShopifyID).
				Msg("Failed to upsert product")
		}
	}

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

	log.Info().
		Str("region", region.Code).
		Int("products", len(newProducts)).
		Int("new", newCount).
		Int("restocks", restockCount).
		Int("priceChanges", priceChanges).
		Msg("Region scrape completed")

	return newCount, restockCount, priceChanges, nil
}
