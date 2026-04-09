package scraper

import (
	"fmt"
	"strings"

	"github.com/yourusername/dropradar/internal/models"
)

// DetectChanges compares old and new products to detect drops
func DetectChanges(oldProducts map[int64]*models.Product, newProducts []models.Product) []models.Drop {
	var drops []models.Drop

	for i := range newProducts {
		newProduct := &newProducts[i]
		oldProduct, exists := oldProducts[newProduct.ShopifyID]

		if !exists {
			// New product
			drop := createDrop(newProduct, models.ChangeTypeNew, "", "")
			drops = append(drops, drop)
			continue
		}

		// Check for restock
		if !oldProduct.IsAvailable && newProduct.IsAvailable {
			drop := createDrop(newProduct, models.ChangeTypeRestock, "unavailable", "available")
			drops = append(drops, drop)
			continue
		}

		// Check for price changes
		if newProduct.Price != oldProduct.Price {
			changeType := models.ChangeTypePriceDrop
			if newProduct.Price > oldProduct.Price {
				changeType = models.ChangeTypePriceIncrease
			}
			drop := createDrop(newProduct, changeType,
				fmt.Sprintf("%.2f", oldProduct.Price),
				fmt.Sprintf("%.2f", newProduct.Price),
			)
			drops = append(drops, drop)
			continue
		}

		// Check for size restocks
		newSizes := findNewSizes(oldProduct.AvailableSizes, newProduct.AvailableSizes)
		if len(newSizes) > 0 && oldProduct.IsAvailable {
			drop := createDrop(newProduct, models.ChangeTypeSizeRestock,
				strings.Join(oldProduct.AvailableSizes, ","),
				strings.Join(newProduct.AvailableSizes, ","),
			)
			drops = append(drops, drop)
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

// findNewSizes returns sizes that are in newSizes but not in oldSizes
func findNewSizes(oldSizes, newSizes []string) []string {
	oldSet := make(map[string]bool)
	for _, s := range oldSizes {
		oldSet[s] = true
	}

	var result []string
	for _, s := range newSizes {
		if !oldSet[s] {
			result = append(result, s)
		}
	}
	return result
}
