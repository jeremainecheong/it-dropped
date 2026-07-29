package scraper

import (
	"fmt"
	"strings"

	"github.com/yourusername/dropradar/internal/models"
)

// DetectChanges compares old and new products to detect drops.
//
// A single cycle can produce SEVERAL events for one product — a restock that
// also cut the price is two facts, not one — so each check appends
// independently rather than short-circuiting to the next product.
func DetectChanges(oldProducts map[int64]*models.Product, newProducts []models.Product) []models.Drop {
	var drops []models.Drop

	for i := range newProducts {
		newProduct := &newProducts[i]
		oldProduct, exists := oldProducts[newProduct.ShopifyID]

		if !exists {
			// Brand new listing. Nothing else is meaningful to diff against.
			drops = append(drops, createDrop(newProduct, models.ChangeTypeNew, "", ""))
			continue
		}

		// --- availability transitions -------------------------------------
		switch {
		case !oldProduct.IsAvailable && newProduct.IsAvailable:
			drops = append(drops, createDrop(newProduct, models.ChangeTypeRestock, "unavailable", "available"))
		case oldProduct.IsAvailable && !newProduct.IsAvailable:
			// The moment of peak user interest: it just went.
			drops = append(drops, createDrop(newProduct, models.ChangeTypeSoldOut, "available", "unavailable"))
		}

		// --- price ---------------------------------------------------------
		if newProduct.Price != oldProduct.Price {
			changeType := models.ChangeTypePriceDrop
			if newProduct.Price > oldProduct.Price {
				changeType = models.ChangeTypePriceIncrease
			}
			drops = append(drops, createDrop(newProduct, changeType,
				fmt.Sprintf("%.2f", oldProduct.Price),
				fmt.Sprintf("%.2f", newProduct.Price),
			))
		}

		// --- size-level movement -------------------------------------------
		// Deliberately NOT gated on the product's previous availability: an
		// item coming back from fully sold out is exactly when size detail
		// matters most, and that case used to be skipped.
		if added := sizeDiff(oldProduct.AvailableSizes, newProduct.AvailableSizes); len(added) > 0 {
			// Suppress when the whole product just restocked — that event
			// already says everything, and two pings for one fact is spam.
			if oldProduct.IsAvailable {
				drops = append(drops, createDrop(newProduct, models.ChangeTypeSizeRestock,
					strings.Join(oldProduct.AvailableSizes, ","),
					strings.Join(added, ","),
				))
			}
		}

		if gone := sizeDiff(newProduct.AvailableSizes, oldProduct.AvailableSizes); len(gone) > 0 && newProduct.IsAvailable {
			drops = append(drops, createDrop(newProduct, models.ChangeTypeSizeSoldOut,
				strings.Join(oldProduct.AvailableSizes, ","),
				strings.Join(gone, ","),
			))
		}
	}

	return drops
}

// createDrop creates a Drop from a product
func createDrop(p *models.Product, changeType models.ChangeType, oldValue, newValue string) models.Drop {
	return models.Drop{
		ProductID:      &p.ID,
		ShopifyID:      p.ShopifyID,
		Region:         p.Region,
		ChangeType:     changeType,
		Title:          p.Title,
		Price:          p.Price,
		Currency:       p.Currency,
		ImageURL:       p.ImageURL,
		ProductURL:     p.ProductURL,
		OldValue:       oldValue,
		NewValue:       newValue,
		AvailableSizes: p.AvailableSizes,
	}
}

// sizeDiff returns the entries present in b but not in a.
func sizeDiff(a, b []string) []string {
	inA := make(map[string]bool, len(a))
	for _, s := range a {
		inA[s] = true
	}

	var result []string
	for _, s := range b {
		if !inA[s] {
			result = append(result, s)
		}
	}
	return result
}
