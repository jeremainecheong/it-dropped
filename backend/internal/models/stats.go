package models

// RegionStats holds aggregated statistics for a specific region
type RegionStats struct {
	Region            string `json:"region"`
	ActiveDrops24h    int    `json:"active_drops_24h"`
	TotalTrackedItems int    `json:"total_tracked_items"`
	TopCategory       string `json:"top_category"`
}
