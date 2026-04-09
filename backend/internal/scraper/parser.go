package scraper

import (
	"strconv"

	"github.com/yourusername/dropradar/internal/models"
)

// Parse converts a Shopify product to our internal Product model
func Parse(sp models.ShopifyProduct, region Region) models.Product {
	p := models.Product{
		ShopifyID:   sp.ID,
		Region:      region.Code,
		Handle:      sp.Handle,
		Title:       sp.Title,
		Vendor:      sp.Vendor,
		ProductType: sp.ProductType,
		Currency:    region.Currency,
		ProductURL:  region.ProductURL(sp.Handle),
	}

	// Parse tags
	if len(sp.Tags) > 0 {
		p.Tags = sp.Tags
	}

	// Get first image
	if len(sp.Images) > 0 {
		p.ImageURL = sp.Images[0].Src
	}

	// Parse variants
	p.TotalVariants = len(sp.Variants)
	availableSizes := []string{}
	hasAvailable := false

	for _, v := range sp.Variants {
		// Parse price from first variant
		if p.Price == 0 {
			if price, err := strconv.ParseFloat(v.Price, 64); err == nil {
				p.Price = price
			}
		}

		// Parse compare at price
		if v.CompareAtPrice != nil && *v.CompareAtPrice != "" && p.ComparePrice == nil {
			if comparePrice, err := strconv.ParseFloat(*v.CompareAtPrice, 64); err == nil {
				p.ComparePrice = &comparePrice
			}
		}

		// Collect available sizes
		if v.Available {
			hasAvailable = true
			size := getVariantSize(v)
			if size != "" {
				availableSizes = append(availableSizes, size)
			}
		}
	}

	p.IsAvailable = hasAvailable
	p.AvailableSizes = availableSizes

	return p
}

// getVariantSize extracts the size from a variant
func getVariantSize(v models.ShopifyVariant) string {
	// Size is typically in Option1 or Title
	if v.Option1 != "" && v.Option1 != "Default Title" {
		return v.Option1
	}
	if v.Title != "" && v.Title != "Default Title" {
		return v.Title
	}
	return ""
}
