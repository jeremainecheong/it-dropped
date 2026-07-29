package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/pkg/httputil"
)

// handleGetAnalytics returns the real time-series behind the dashboard.
func (s *Server) handleGetAnalytics(c *gin.Context) {
	ctx := c.Request.Context()

	days := 30
	if d := c.Query("days"); d != "" {
		if parsed, err := strconv.Atoi(d); err == nil && parsed > 0 && parsed <= 90 {
			days = parsed
		}
	}

	activity, err := s.db.GetDropActivity(ctx, 7)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch drop activity")
		return
	}

	bands, err := s.db.GetPriceBands(ctx, days)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch price bands")
		return
	}

	categories, err := s.db.GetCategoryBreakdown(ctx, 8)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch categories")
		return
	}

	httputil.JSON(c, gin.H{
		"drop_activity": activity,
		"price_bands":   bands,
		"categories":    categories,
	})
}
