package api

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/internal/models"
	"github.com/yourusername/dropradar/pkg/httputil"
)

// handleGetProducts returns a list of products
func (s *Server) handleGetProducts(c *gin.Context) {
	ctx := c.Request.Context()

	// Parse query parameters
	filter := models.ProductFilter{
		Region: c.Query("region"),
		Limit:  50,
		Offset: 0,
	}

	// Parse product types (comma-separated)
	if productType := c.Query("product_type"); productType != "" {
		filter.Categories = strings.Split(productType, ",")
	}

	// Parse available filter
	if available := c.Query("available"); available != "" {
		b, err := strconv.ParseBool(available)
		if err == nil {
			filter.IsAvailable = &b
		}
	}

	// Parse sort (whitelisted)
	switch c.Query("sort") {
	case models.SortNewest:
		filter.Sort = models.SortNewest
	case models.SortPriceAsc:
		filter.Sort = models.SortPriceAsc
	case models.SortPriceDesc:
		filter.Sort = models.SortPriceDesc
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

	// Get products
	products, err := s.db.GetProducts(ctx, filter)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch products")
		return
	}

	// Get total count
	total, _ := s.db.CountProducts(ctx, filter)

	httputil.JSONWithMeta(c, products, &httputil.Meta{
		Total:  total,
		Limit:  filter.Limit,
		Offset: filter.Offset,
	})
}

// handleGetCategories returns a list of product categories
func (s *Server) handleGetCategories(c *gin.Context) {
	ctx := c.Request.Context()

	categories, err := s.db.GetCategories(ctx)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch categories")
		return
	}

	httputil.JSON(c, categories)
}

// handleGetProductByID returns a single product by ID
func (s *Server) handleGetProductByID(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	if id == "" {
		httputil.BadRequest(c, "Missing product ID")
		return
	}

	product, err := s.db.GetProductByID(ctx, id)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch product")
		return
	}
	if product == nil {
		httputil.NotFound(c, "Product not found")
		return
	}

	httputil.JSON(c, product)
}

// handleSearchProducts performs full-text search on products
func (s *Server) handleSearchProducts(c *gin.Context) {
	ctx := c.Request.Context()

	query := c.Query("q")
	if query == "" {
		httputil.BadRequest(c, "Missing search query 'q'")
		return
	}

	// Parse optional filters
	region := c.Query("region")
	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	products, err := s.db.SearchProducts(ctx, query, region, limit)
	if err != nil {
		httputil.InternalError(c, "Search failed")
		return
	}

	httputil.JSON(c, products)
}

// handleGetProductsByHandle returns all variants of a product across regions
func (s *Server) handleGetProductsByHandle(c *gin.Context) {
	ctx := c.Request.Context()
	handle := c.Param("handle")

	if handle == "" {
		httputil.BadRequest(c, "Missing product handle")
		return
	}

	products, err := s.db.GetProductsByHandle(ctx, handle)
	if err != nil {
		httputil.InternalError(c, "Failed to fetch products")
		return
	}

	httputil.JSON(c, products)
}
