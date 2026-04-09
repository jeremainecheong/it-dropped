package api

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/internal/models"
	"github.com/yourusername/dropradar/pkg/httputil"
)

// handleGetTrending returns trending/popular products (most recently updated)
func (s *Server) handleGetTrending(c *gin.Context) {
	ctx := c.Request.Context()

	limit := 10
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 20 {
			limit = parsed
		}
	}

	// Get latest updated products as trending
	filter := models.ProductFilter{
		Limit:  limit,
		Offset: 0,
	}

	products, err := s.db.GetProducts(ctx, filter)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch trending products")
		return
	}

	httputil.JSON(c, products)
}
