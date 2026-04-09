package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/api"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
)

func main() {
	// Setup logging
	zerolog.TimeFieldFormat = time.RFC3339
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Info().Msg("Shutdown signal received")
		cancel()
	}()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// Set log level
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	log.Info().Msg("Starting Dropradar API Server")

	log.Info().Msg("Starting Dropradar API Server")

	// Initialize database or mock store
	var db database.Store
	if cfg.MockMode {
		log.Info().Msg("Starting in MOCK MODE")
		db = database.NewMockStore()
	} else {
		realDB, err := database.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to connect to database")
		}
		db = realDB
	}
	defer db.Close()

	// Initialize and run API server
	server := api.NewServer(cfg, db)

	addr := ":" + cfg.APIPort
	log.Info().Str("addr", addr).Msg("API server listening")

	if err := server.Run(addr); err != nil {
		log.Fatal().Err(err).Msg("API server failed")
	}
}
