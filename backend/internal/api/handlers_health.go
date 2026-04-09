package api

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yourusername/dropradar/pkg/httputil"
)

var startTime = time.Now()

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

// StatusResponse represents the system status response
type StatusResponse struct {
	Status        string      `json:"status"`
	Database      string      `json:"database"`
	Uptime        string      `json:"uptime"`
	RecentScrapes interface{} `json:"recent_scrapes,omitempty"`
}

// handleHealth returns basic health status
func (s *Server) handleHealth(c *gin.Context) {
	httputil.JSON(c, HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// handleStatus returns detailed system status
func (s *Server) handleStatus(c *gin.Context) {
	ctx := c.Request.Context()

	// Check database connection
	dbStatus := "connected"
	if err := s.db.Health(ctx); err != nil {
		dbStatus = "disconnected"
	}

	// Get recent scrape logs
	recentScrapes, _ := s.db.GetRecentScrapeLogs(ctx, 5)

	uptime := time.Since(startTime).Round(time.Second).String()

	httputil.JSON(c, StatusResponse{
		Status:        "ok",
		Database:      dbStatus,
		Uptime:        uptime,
		RecentScrapes: recentScrapes,
	})
}
