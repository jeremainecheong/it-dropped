package database

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/models"
)

// MockStore implements Store with in-memory data
type MockStore struct {
	mu         sync.RWMutex
	products   map[int64]*models.Product
	drops      []models.Drop
	scrapeLogs []models.ScrapeLog
}

// NewMockStore creates a new mock store with sample data
func NewMockStore() *MockStore {
	store := &MockStore{
		products:   make(map[int64]*models.Product),
		drops:      make([]models.Drop, 0),
		scrapeLogs: make([]models.ScrapeLog, 0),
	}
	store.seedData()
	log.Info().Msg("Mock Store initialized with sample data")
	return store
}

func (m *MockStore) seedData() {
	now := time.Now()

	// Catalog spread across regions so cross-region comparison, sale badges
	// and "new" badges are all exercisable in mock mode.
	type seed struct {
		shopifyID    int64
		region       string
		handle       string
		title        string
		productType  string
		price        float64
		comparePrice float64 // 0 = not on sale
		currency     string
		available    bool
		sizes        []string
		image        string
		firstSeenAgo time.Duration
	}

	seeds := []seed{
		// Same product across 4 regions — JP is the cheapest in USD terms
		{12345, "us", "dyed-nylon-bomber-black", "Dyed Nylon Bomber", "Mens Long Sleeve Outerwear", 250, 0, "USD", true, []string{"S", "M", "L", "XL"}, "https://static.stussy.com/bomber.jpg", 26 * time.Hour},
		{12346, "uk", "dyed-nylon-bomber-black", "Dyed Nylon Bomber", "Mens Long Sleeve Outerwear", 205, 0, "GBP", true, []string{"M", "L"}, "https://static.stussy.com/bomber.jpg", 26 * time.Hour},
		{12347, "jp", "dyed-nylon-bomber-black", "Dyed Nylon Bomber", "Mens Long Sleeve Outerwear", 28000, 0, "JPY", true, []string{"S", "M", "L"}, "https://static.stussy.com/bomber.jpg", 26 * time.Hour},
		{12348, "eu", "dyed-nylon-bomber-black", "Dyed Nylon Bomber", "Mens Long Sleeve Outerwear", 245, 0, "EUR", false, []string{}, "https://static.stussy.com/bomber.jpg", 26 * time.Hour},

		// On sale — drives the discount badge
		{67890, "us", "big-ol-jean-blue", "Big OL' Jean", "Mens Pant", 120, 150, "USD", true, []string{"30", "32", "34"}, "https://static.stussy.com/jeans.jpg", 60 * time.Hour},
		{67891, "uk", "big-ol-jean-blue", "Big OL' Jean", "Mens Pant", 110, 130, "GBP", true, []string{"32"}, "https://static.stussy.com/jeans.jpg", 60 * time.Hour},

		// Fresh arrivals — drive the "new" badge
		{22001, "us", "stock-logo-hoodie-charcoal", "Stock Logo Hoodie", "Mens Long Sleeve Sweatshirt", 165, 0, "USD", true, []string{"S", "M", "L", "XL"}, "https://static.stussy.com/hoodie.jpg", 3 * time.Hour},
		{22002, "jp", "stock-logo-hoodie-charcoal", "Stock Logo Hoodie", "Mens Long Sleeve Sweatshirt", 22000, 0, "JPY", true, []string{"M", "L"}, "https://static.stussy.com/hoodie.jpg", 5 * time.Hour},
		{22003, "us", "basic-stussy-tee-sage", "Basic Stüssy Tee", "Mens Short Sleeve T-Shirt", 45, 0, "USD", true, []string{"S", "M", "L", "XL"}, "https://static.stussy.com/tee.jpg", 8 * time.Hour},

		// Sold out + older, for empty/greyed states
		{22004, "au", "canvas-coach-jacket", "Canvas Coach Jacket", "Mens Long Sleeve Outerwear", 320, 0, "AUD", false, []string{}, "https://static.stussy.com/coach.jpg", 200 * time.Hour},
		{22005, "sg", "stock-link-sweater-natural", "Stock Link Sweater", "Mens Long Sleeve Sweater", 190, 0, "SGD", true, []string{"M", "L"}, "https://static.stussy.com/sweater.jpg", 90 * time.Hour},
	}

	var firstNewID uuid.UUID
	var firstNew *models.Product

	for _, sd := range seeds {
		id := uuid.New()
		p := &models.Product{
			ID:             id,
			ShopifyID:      sd.shopifyID,
			Region:         sd.region,
			Handle:         sd.handle,
			Title:          sd.title,
			Vendor:         "Stussy",
			ProductType:    sd.productType,
			Tags:           []string{"mens"},
			Price:          sd.price,
			Currency:       sd.currency,
			IsAvailable:    sd.available,
			AvailableSizes: sd.sizes,
			TotalVariants:  len(sd.sizes),
			ImageURL:       sd.image,
			ProductURL:     "https://www.stussy.com/products/" + sd.handle,
			FirstSeenAt:    now.Add(-sd.firstSeenAgo),
			LastSeenAt:     now,
		}
		if sd.comparePrice > 0 {
			cp := sd.comparePrice
			p.ComparePrice = &cp
		}
		m.products[p.ShopifyID] = p

		if firstNew == nil && sd.firstSeenAgo < 24*time.Hour {
			firstNew, firstNewID = p, id
		}
	}

	if firstNew != nil {
		m.drops = append(m.drops, models.Drop{
			ID:             uuid.New(),
			ProductID:      &firstNewID,
			ShopifyID:      firstNew.ShopifyID,
			Region:         firstNew.Region,
			ChangeType:     models.ChangeTypeNew,
			Title:          firstNew.Title,
			Price:          firstNew.Price,
			Currency:       firstNew.Currency,
			ImageURL:       firstNew.ImageURL,
			ProductURL:     firstNew.ProductURL,
			AvailableSizes: firstNew.AvailableSizes,
			NewValue:       "New Arrival",
			DetectedAt:     now.Add(-1 * time.Hour),
			Notified:       false,
		})
	}
}

func (m *MockStore) Close() {
	log.Info().Msg("Mock Store closed")
}

func (m *MockStore) Health(ctx context.Context) error {
	return nil // Always healthy
}

// Product Methods

func (m *MockStore) UpsertProduct(ctx context.Context, p *models.Product) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	p.LastSeenAt = time.Now()
	m.products[p.ShopifyID] = p
	return nil
}

func (m *MockStore) GetProductByShopifyID(ctx context.Context, shopifyID int64, region string) (*models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if p, ok := m.products[shopifyID]; ok && p.Region == region {
		return p, nil
	}
	return nil, nil
}

func (m *MockStore) GetProductByID(ctx context.Context, id string) (*models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	targetUUID, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid uuid: %w", err)
	}

	for _, p := range m.products {
		if p.ID == targetUUID {
			return p, nil
		}
	}
	return nil, nil
}

func (m *MockStore) GetRegionStats(ctx context.Context) ([]models.RegionStats, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	regions := []string{"us", "uk", "eu", "jp", "au", "sg"}
	stats := make([]models.RegionStats, 0)

	for _, region := range regions {
		activeCount := 0
		totalCount := 0
		categoryCount := make(map[string]int)

		for _, p := range m.products {
			if p.Region == region {
				totalCount++
				if p.IsAvailable { // Simplified "active drop" logic for mock
					activeCount++
				}
				if p.ProductType != "" {
					categoryCount[p.ProductType]++
				}
			}
		}

		topCat := "N/A"
		maxCatCount := 0
		for cat, count := range categoryCount {
			if count > maxCatCount {
				maxCatCount = count
				topCat = cat
			}
		}

		stats = append(stats, models.RegionStats{
			Region:            region,
			ActiveDrops24h:    activeCount,
			TotalTrackedItems: totalCount,
			TopCategory:       topCat,
		})
	}
	return stats, nil
}

func (m *MockStore) GetProducts(ctx context.Context, filter models.ProductFilter) ([]models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Filter
	var result []models.Product
	for _, p := range m.products {
		if filter.Region != "" && p.Region != filter.Region {
			continue
		}
		if len(filter.Categories) > 0 && !containsCategory(filter.Categories, p.ProductType) {
			continue
		}
		if filter.IsAvailable != nil && p.IsAvailable != *filter.IsAvailable {
			continue
		}
		result = append(result, *p)
	}

	// Mirror the SQL ordering (currency-normalised price, id tiebreaker) so
	// mock mode pages and ranks exactly like production.
	switch filter.Sort {
	case models.SortNewest:
		sort.Slice(result, func(i, j int) bool {
			if !result[i].FirstSeenAt.Equal(result[j].FirstSeenAt) {
				return result[i].FirstSeenAt.After(result[j].FirstSeenAt)
			}
			return result[i].ID.String() < result[j].ID.String()
		})
	case models.SortPriceAsc:
		sort.Slice(result, func(i, j int) bool {
			a, b := priceUSD(&result[i]), priceUSD(&result[j])
			if a != b {
				return a < b
			}
			return result[i].ID.String() < result[j].ID.String()
		})
	case models.SortPriceDesc:
		sort.Slice(result, func(i, j int) bool {
			a, b := priceUSD(&result[i]), priceUSD(&result[j])
			if a != b {
				return a > b
			}
			return result[i].ID.String() < result[j].ID.String()
		})
	default:
		sort.Slice(result, func(i, j int) bool {
			if !result[i].LastSeenAt.Equal(result[j].LastSeenAt) {
				return result[i].LastSeenAt.After(result[j].LastSeenAt)
			}
			return result[i].ID.String() < result[j].ID.String()
		})
	}

	// Apply limit/offset
	start := filter.Offset
	if start >= len(result) {
		return []models.Product{}, nil
	}
	end := start + filter.Limit
	if end > len(result) {
		end = len(result)
	}
	if end == 0 { // Explicit limit 0 or default
		if filter.Limit == 0 && filter.Offset == 0 {
			// Return all if no pagination
			return result, nil
		}
	}

	return result[start:end], nil
}

func (m *MockStore) GetAllProductsByRegion(ctx context.Context, region string) (map[int64]*models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[int64]*models.Product)
	for id, p := range m.products {
		if p.Region == region {
			result[id] = p
		}
	}
	return result, nil
}

func (m *MockStore) CountProducts(ctx context.Context, filter models.ProductFilter) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, p := range m.products {
		if filter.Region != "" && p.Region != filter.Region {
			continue
		}
		if len(filter.Categories) > 0 && !containsCategory(filter.Categories, p.ProductType) {
			continue
		}
		if filter.IsAvailable != nil && p.IsAvailable != *filter.IsAvailable {
			continue
		}
		count++
	}
	return count, nil
}

func (m *MockStore) GetCategories(ctx context.Context) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	seen := make(map[string]bool)
	var categories []string
	for _, p := range m.products {
		if p.ProductType != "" && !seen[p.ProductType] {
			seen[p.ProductType] = true
			categories = append(categories, p.ProductType)
		}
	}
	return categories, nil
}

// SearchProducts performs simple substring search on mock data
func (m *MockStore) SearchProducts(ctx context.Context, query string, region string, limit int) ([]models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Case-insensitive substring match, approximating the Postgres
	// full-text search used by the real store.
	needle := strings.ToLower(query)

	results := make([]models.Product, 0)
	for _, p := range m.products {
		if region != "" && p.Region != region {
			continue
		}
		haystack := strings.ToLower(p.Title + " " + p.Vendor + " " + p.ProductType + " " + p.Handle)
		if strings.Contains(haystack, needle) {
			results = append(results, *p)
			if len(results) >= limit {
				break
			}
		}
	}

	// Stable ordering so repeated searches don't shuffle (map iteration is random)
	sort.Slice(results, func(i, j int) bool { return results[i].Title < results[j].Title })

	return results, nil
}

// Helper for mock search
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// containsCategory checks if a product type is in the categories slice
func containsCategory(categories []string, productType string) bool {
	for _, cat := range categories {
		if cat == productType {
			return true
		}
	}
	return false
}

// GetProductsByHandle returns products matching the handle across all regions
func (m *MockStore) GetProductsByHandle(ctx context.Context, handle string) ([]models.Product, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var results []models.Product
	for _, p := range m.products {
		if p.Handle == handle {
			results = append(results, *p)
		}
	}
	return results, nil
}

// Drop Methods

func (m *MockStore) CreateDrop(ctx context.Context, d *models.Drop) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	d.DetectedAt = time.Now()
	m.drops = append([]models.Drop{*d}, m.drops...)
	return nil
}

func (m *MockStore) GetDrops(ctx context.Context, filter models.DropFilter) ([]models.Drop, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []models.Drop
	for _, d := range m.drops {
		if filter.Region != "" && d.Region != filter.Region {
			continue
		}
		if filter.ChangeType != "" && d.ChangeType != filter.ChangeType {
			continue
		}
		if filter.Notified != nil && d.Notified != *filter.Notified {
			continue
		}
		result = append(result, d)
	}
	return result, nil
}

func (m *MockStore) GetUnnotifiedDrops(ctx context.Context) ([]models.Drop, error) {
	notified := false
	return m.GetDrops(ctx, models.DropFilter{Notified: &notified})
}

func (m *MockStore) MarkDropNotified(ctx context.Context, dropID uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.drops {
		if m.drops[i].ID == dropID {
			m.drops[i].Notified = true
			now := time.Now()
			m.drops[i].NotifiedAt = &now
			return nil
		}
	}
	return fmt.Errorf("drop not found")
}

func (m *MockStore) CountDrops(ctx context.Context, filter models.DropFilter) (int, error) {
	drops, _ := m.GetDrops(ctx, filter)
	return len(drops), nil
}

// Scrape Log Methods

func (m *MockStore) CreateScrapeLog(ctx context.Context, region string) (*models.ScrapeLog, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	log := &models.ScrapeLog{
		ID:        uuid.New(),
		Region:    region,
		Status:    models.ScrapeStatusRunning, // Assuming constant
		StartedAt: time.Now(),
	}
	m.scrapeLogs = append([]models.ScrapeLog{*log}, m.scrapeLogs...)
	return log, nil
}

func (m *MockStore) CompleteScrapeLog(ctx context.Context, logDetail *models.ScrapeLog) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i := range m.scrapeLogs {
		if m.scrapeLogs[i].ID == logDetail.ID {
			m.scrapeLogs[i] = *logDetail
			now := time.Now()
			m.scrapeLogs[i].CompletedAt = &now
			// Update duration...
			return nil
		}
	}
	return nil
}

func (m *MockStore) GetRecentScrapeLogs(ctx context.Context, limit int) ([]models.ScrapeLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if limit > len(m.scrapeLogs) {
		limit = len(m.scrapeLogs)
	}
	return m.scrapeLogs[:limit], nil
}

func (m *MockStore) GetLatestScrapeLogByRegion(ctx context.Context, region string) (*models.ScrapeLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, l := range m.scrapeLogs {
		if l.Region == region {
			return &l, nil
		}
	}
	return nil, nil // Not found
}

// fxToUSD mirrors priceUSDExpr (and frontend/lib/currency.ts) so mock-mode
// price ordering matches the real SQL ordering.
var fxToUSD = map[string]float64{
	"USD": 1.0, "GBP": 1.27, "EUR": 1.08, "JPY": 0.0067, "AUD": 0.65, "SGD": 0.74,
}

func priceUSD(p *models.Product) float64 {
	if rate, ok := fxToUSD[p.Currency]; ok {
		return p.Price * rate
	}
	return p.Price
}
