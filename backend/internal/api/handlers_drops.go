package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/internal/models"
	"github.com/yourusername/dropradar/pkg/httputil"
)

// handleGetDrops returns a list of drops
func (s *Server) handleGetDrops(c *gin.Context) {
	ctx := c.Request.Context()

	// Parse query parameters
	filter := models.DropFilter{
		Region:     c.Query("region"),
		ChangeType: models.ChangeType(c.Query("type")),
		Limit:      50,
		Offset:     0,
	}

	// Parse notified filter
	if notified := c.Query("notified"); notified != "" {
		b, err := strconv.ParseBool(notified)
		if err == nil {
			filter.Notified = &b
		}
	}

	// Parse limit
	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
			filter.Limit = l
		}
	}

	// Parse offset
	if offset := c.Query("offset"); offset != "" {
		if o, err := strconv.Atoi(offset); err == nil && o >= 0 {
			filter.Offset = o
		}
	}

	// Get drops
	drops, err := s.db.GetDrops(ctx, filter)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch drops")
		return
	}

	// Get total count
	total, _ := s.db.CountDrops(ctx, filter)

	httputil.JSONWithMeta(c, drops, &httputil.Meta{
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

// handleGetStats returns aggregated stats per region
func (s *Server) handleGetStats(c *gin.Context) {
	ctx := c.Request.Context()

	stats, err := s.db.GetRegionStats(ctx)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch stats")
		return
	}

	httputil.JSON(c, stats)
}
