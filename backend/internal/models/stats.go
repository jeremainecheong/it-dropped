package models

import "time"

// RegionStats holds aggregated statistics for a specific region
type RegionStats struct {
	Region            string `json:"region"`
	ActiveDrops24h    int    `json:"active_drops_24h"`
	TotalTrackedItems int    `json:"total_tracked_items"`
	TopCategory       string `json:"top_category"`
}

// DropActivityPoint is one day of drop-event counts, used by the dashboard
// instead of the client-side random generators it used to plot.
type DropActivityPoint struct {
	Day        time.Time `json:"day"`
	Drops      int       `json:"drops"`
	Restocks   int       `json:"restocks"`
	SoldOut    int       `json:"sold_out"`
	PriceDrops int       `json:"price_drops"`
}

// PriceBandPoint is one day of observed price spread, in approximate USD.
type PriceBandPoint struct {
	Day     time.Time `json:"day"`
	Avg     float64   `json:"avg"`
	Min     float64   `json:"min"`
	Max     float64   `json:"max"`
	Samples int       `json:"samples"`
}

// CategoryCount is how many tracked products fall in a product type.
type CategoryCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}
