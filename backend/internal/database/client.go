package database

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

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

	// pgx caches named prepared statements by default, which a connection
	// pooler in transaction mode cannot honour: the next statement on that
	// connection may land on a different backend, and the query fails with
	// "prepared statement already exists". Supabase hands out a transaction
	// pooler on :6543 and a session pooler on :5432, and its dashboard offers
	// the transaction one first, so this is easy to hit and reads as a
	// database outage rather than a URL choice. QueryExecModeExec keeps
	// server-side parameter binding but uses unnamed statements, which pooling
	// does tolerate.
	if usesTransactionPooler(connString) {
		config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
		log.Info().Msg("Transaction pooler detected — using unnamed prepared statements")
	}

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

// usesTransactionPooler reports whether the connection string points at a
// pooler running in transaction mode. Supabase exposes that on port 6543;
// other poolers conventionally advertise it with ?pgbouncer=true.
func usesTransactionPooler(connString string) bool {
	return strings.Contains(connString, ":6543") ||
		strings.Contains(connString, "pgbouncer=true")
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
