package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		fmt.Println("Warning: Error loading .env file")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		fmt.Println("Error: DATABASE_URL is empty")
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Add search_vector column
	sql := `
	ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;
	
	CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);
	
	CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
	BEGIN
	  NEW.search_vector := 
	    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
	    setweight(to_tsvector('english', COALESCE(NEW.vendor, '')), 'B') ||
	    setweight(to_tsvector('english', COALESCE(NEW.product_type, '')), 'C') ||
	    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
	  RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;
	
	DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
	CREATE TRIGGER products_search_vector_trigger
	  BEFORE INSERT OR UPDATE ON products
	  FOR EACH ROW
	  EXECUTE FUNCTION products_search_vector_update();
	
	UPDATE products SET search_vector = 
	  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
	  setweight(to_tsvector('english', COALESCE(vendor, '')), 'B') ||
	  setweight(to_tsvector('english', COALESCE(product_type, '')), 'C') ||
	  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'D');
	`

	_, err = pool.Exec(ctx, sql)
	if err != nil {
		fmt.Printf("Error executing migration: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Migration successful: Full-text search enabled.")
}
