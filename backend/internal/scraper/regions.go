package scraper

import (
	"fmt"
	"strings"
)

// Region represents a Stüssy regional store
type Region struct {
	Code         string
	Name         string
	BaseURL      string
	Currency     string
	VendorFilter string // Optional: if set, only products with this Vendor will be processed
}

// Regions contains all supported Stüssy regional stores
var Regions = map[string]Region{
	"us": {
		Code:     "us",
		Name:     "United States",
		BaseURL:  "https://www.stussy.com",
		Currency: "USD",
	},
	"uk": {
		Code:     "uk",
		Name:     "United Kingdom",
		BaseURL:  "https://uk.stussy.com",
		Currency: "GBP",
	},
	"eu": {
		Code:     "eu",
		Name:     "Europe",
		BaseURL:  "https://eu.stussy.com",
		Currency: "EUR",
	},
	"jp": {
		Code:     "jp",
		Name:     "Japan",
		BaseURL:  "https://www.stussy.jp",
		Currency: "JPY",
	},
	"au": {
		Code:     "au",
		Name:     "Australia",
		BaseURL:  "https://stussy.com.au",
		Currency: "AUD",
	},
	"sg": {
		Code:         "sg",
		Name:         "Singapore",
		BaseURL:      "https://shop-sg.doverstreetmarket.com/collections/shops-stussy",
		Currency:     "SGD",
		VendorFilter: "Stussy", // DSM SG uses specific vendor name
	},
}

// MatchesVendor reports whether a product's vendor passes this region's
// filter. Matching is deliberately fuzzy: Dover Street Market Singapore lists
// the same brand as both "Stussy" and "Stüssy", and an exact string compare
// silently discarded 50 of 345 products (14% of the region's catalogue).
func (r Region) MatchesVendor(vendor string) bool {
	if r.VendorFilter == "" {
		return true
	}
	return foldVendor(vendor) == foldVendor(r.VendorFilter)
}

// foldVendor normalises a vendor name for comparison: lowercased, accents
// folded to ASCII, and separators removed.
func foldVendor(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(s)) {
		switch r {
		case 'ü', 'û', 'ù', 'ú':
			r = 'u'
		case 'é', 'è', 'ê', 'ë':
			r = 'e'
		case 'á', 'à', 'â', 'ä', 'å', 'ã':
			r = 'a'
		case 'í', 'ì', 'î', 'ï':
			r = 'i'
		case 'ó', 'ò', 'ô', 'ö', 'õ':
			r = 'o'
		case 'ç':
			r = 'c'
		case 'ñ':
			r = 'n'
		case ' ', '-', '.', '\'', '’':
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

// ProductsURL returns the products.json URL for this region
func (r Region) ProductsURL() string {
	return r.ProductsPageURL(1)
}

// ProductsPageURL returns the products.json URL for a specific page
func (r Region) ProductsPageURL(page int) string {
	return fmt.Sprintf("%s/products.json?limit=250&page=%d", r.BaseURL, page)
}

// ProductURL returns the full product URL for a handle
func (r Region) ProductURL(handle string) string {
	return r.BaseURL + "/products/" + handle
}

// GetRegion returns a region by code, or nil if not found
func GetRegion(code string) *Region {
	if r, ok := Regions[code]; ok {
		return &r
	}
	return nil
}

// GetAllRegionCodes returns all region codes
func GetAllRegionCodes() []string {
	codes := make([]string, 0, len(Regions))
	for code := range Regions {
		codes = append(codes, code)
	}
	return codes
}
