package scraper

import "fmt"

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
