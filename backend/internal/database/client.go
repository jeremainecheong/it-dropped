package database

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/models"
)

// Store defines the interface for database operations
type Store interface {
	UpsertProduct(ctx context.Context, p *models.Product) error
	GetProductByShopifyID(ctx context.Context, shopifyID int64, region string) (*models.Product, error)
	GetProductByID(ctx context.Context, id string) (*models.Product, error)
	GetProducts(ctx context.Context, filter models.ProductFilter) ([]models.Product, error)
	SearchProducts(ctx context.Context, query string, region string, limit int) ([]models.Product, error)
	GetProductsByHandle(ctx context.Context, handle string) ([]models.Product, error)
	GetCategories(ctx context.Context) ([]string, error)
	GetAllProductsByRegion(ctx context.Context, region string) (map[int64]*models.Product, error)
	CountProducts(ctx context.Context, filter models.ProductFilter) (int, error)

	CreateDrop(ctx context.Context, d *models.Drop) error
	GetDrops(ctx context.Context, filter models.DropFilter) ([]models.Drop, error)
	GetUnnotifiedDrops(ctx context.Context) ([]models.Drop, error)
	MarkDropNotified(ctx context.Context, dropID uuid.UUID) error
	CountDrops(ctx context.Context, filter models.DropFilter) (int, error)

	// Scrape Logs
	CreateScrapeLog(ctx context.Context, region string) (*models.ScrapeLog, error)
	CompleteScrapeLog(ctx context.Context, log *models.ScrapeLog) error
	GetRecentScrapeLogs(ctx context.Context, limit int) ([]models.ScrapeLog, error)
	GetLatestScrapeLogByRegion(ctx context.Context, region string) (*models.ScrapeLog, error)

	GetRegionStats(ctx context.Context) ([]models.RegionStats, error)

	Health(ctx context.Context) error
	Close()
}

// Client wraps the PostgreSQL connection pool
type Client struct {
	pool *pgxpool.Pool
}

// New creates a new database client
func New(ctx context.Context, connString string) (*Client, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("failed to parse connection string: %w", err)
	}

	// Configure pool settings
	config.MaxConns = 10
	config.MinConns = 2

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info().Msg("Database connection established")

	return &Client{pool: pool}, nil
}

// Health checks the database connection
func (c *Client) Health(ctx context.Context) error {
	return c.pool.Ping(ctx)
}

// Close closes the database connection pool
func (c *Client) Close() {
	c.pool.Close()
	log.Info().Msg("Database connection closed")
}

// Pool returns the underlying connection pool
func (c *Client) Pool() *pgxpool.Pool {
	return c.pool
}
