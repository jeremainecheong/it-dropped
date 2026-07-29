package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
)

// Server holds the API server dependencies
type Server struct {
	cfg    *config.Config
	db     database.Store
	router *gin.Engine
}

// NewServer creates a new API server
func NewServer(cfg *config.Config, db database.Store) *Server {
	gin.SetMode(cfg.GinMode)

	s := &Server{
		cfg:    cfg,
		db:     db,
		router: gin.New(),
	}

	s.setupMiddleware()
	s.setupRoutes()

	return s
}

// setupMiddleware configures middleware
func (s *Server) setupMiddleware() {
	s.router.Use(LoggerMiddleware())
	s.router.Use(gin.Recovery())
	s.router.Use(CORSMiddleware())

	// Rate limiting: 100 requests per minute per IP
	limiter := NewRateLimiter(100, time.Minute)
	s.router.Use(RateLimitMiddleware(limiter))
}

// setupRoutes configures API routes
func (s *Server) setupRoutes() {
	// Health endpoints
	s.router.GET("/health", s.handleHealth)
	s.router.GET("/status", s.handleStatus)

	// API v1 group
	v1 := s.router.Group("/api/v1")
	{
		v1.GET("/products", s.handleGetProducts)
		v1.GET("/products/search", s.handleSearchProducts)
		v1.GET("/products/by-handle/:handle", s.handleGetProductsByHandle)
		v1.GET("/products/:id", s.handleGetProductByID)
		v1.GET("/categories", s.handleGetCategories)
		v1.GET("/drops", s.handleGetDrops)
		v1.GET("/trending", s.handleGetTrending)
		v1.GET("/stats", s.handleGetStats)
		v1.GET("/analytics", s.handleGetAnalytics)
	}

	// Also expose at root for convenience
	s.router.GET("/products", s.handleGetProducts)
	s.router.GET("/drops", s.handleGetDrops)
}

// Router returns the Gin engine
func (s *Server) Router() *gin.Engine {
	return s.router
}

// Run starts the API server
func (s *Server) Run(addr string) error {
	return s.router.Run(addr)
}
