package database

import (
	"context"
	"fmt"
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
	// Sample Products
	now := time.Now()

	// Product 1: Stussy Dyed NYLON BOMBER
	p1ID := uuid.New()
	p1 := &models.Product{
		ID:             p1ID,
		ShopifyID:      12345,
		Region:         "us",
		Handle:         "dyed-nylon-bomber-black",
		Title:          "Dyed Nylon Bomber",
		Vendor:         "Stussy",
		ProductType:    "Outerwear",
		Tags:           []string{"mens", "outerwear"},
		Price:          250.00,
		Currency:       "USD",
		IsAvailable:    true,
		AvailableSizes: []string{"S", "M", "L", "XL"},
		TotalVariants:  4,
		ImageURL:       "https://static.stussy.com/basic-tee.jpg",
		ProductURL:     "https://www.stussy.com/products/dyed-nylon-bomber-black",
		FirstSeenAt:    now.Add(-24 * time.Hour),
		LastSeenAt:     now,
	}
	m.products[p1.ShopifyID] = p1

	// Product 2: Big OL' Jean (Sold Out)
	p2ID := uuid.New()
	p2 := &models.Product{
		ID:             p2ID,
		ShopifyID:      67890,
		Region:         "us",
		Handle:         "big-ol-jean-blue",
		Title:          "Big OL' Jean",
		Vendor:         "Stussy",
		ProductType:    "Denim",
		Tags:           []string{"mens", "pants"},
		Price:          150.00,
		Currency:       "USD",
		IsAvailable:    false,
		AvailableSizes: []string{},
		TotalVariants:  5,
		ImageURL:       "https://static.stussy.com/jeans.jpg",
		ProductURL:     "https://www.stussy.com/products/big-ol-jean-blue",
		FirstSeenAt:    now.Add(-48 * time.Hour),
		LastSeenAt:     now,
	}
	m.products[p2.ShopifyID] = p2

	// Sample Drops
	// Drop 1: New Product (p1)
	drop1 := models.Drop{
		ID:             uuid.New(),
		ProductID:      &p1ID,
		ShopifyID:      p1.ShopifyID,
		Region:         "us",
		ChangeType:     "new", // Fixed: ChangeType constant? using string "new" or constant if visible
		Title:          p1.Title,
		Price:          p1.Price,
		Currency:       p1.Currency,
		ImageURL:       p1.ImageURL,
		ProductURL:     p1.ProductURL,
		AvailableSizes: p1.AvailableSizes,
		NewValue:       "New Arrival",
		DetectedAt:     now.Add(-1 * time.Hour),
		Notified:       false,
	}
	m.drops = append(m.drops, drop1)
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

	var results []models.Product
	lowerQuery := query // Simplified - no lowercase matching in mock

	for _, p := range m.products {
		if region != "" && p.Region != region {
			continue
		}
		// Simple substring match on title
		if contains(p.Title, lowerQuery) || contains(p.Vendor, lowerQuery) || contains(p.ProductType, lowerQuery) {
			results = append(results, *p)
			if len(results) >= limit {
				break
			}
		}
	}
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
