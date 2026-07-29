package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
	"github.com/yourusername/dropradar/internal/scraper"
	"github.com/yourusername/dropradar/internal/telegram"
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

	log.Info().Msg("Starting Dropradar Scraper")

	// Initialize database
	db, err := database.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Initialize scraper
	s := scraper.New(cfg, db)

	// Outbound notifications. The scraper is the only process that knows a
	// drop just happened, so it owns delivery. Optional: with no bot token
	// configured the scraper still runs, it just doesn't announce anything.
	var notifier *telegram.Notifier
	if cfg.TelegramBotToken != "" {
		bot, err := telegram.New(cfg, db)
		if err != nil {
			log.Error().Err(err).Msg("Telegram bot unavailable; running without notifications")
		} else {
			notifier = telegram.NewNotifier(bot, db)
			log.Info().Msg("Drop notifications enabled")
		}
	} else {
		log.Warn().Msg("TELEGRAM_BOT_TOKEN unset — drops will be detected but not announced")
	}

	// Scraper loop
	ticker := time.NewTicker(cfg.ScrapeInterval)
	defer ticker.Stop()

	log.Info().
		Dur("interval", cfg.ScrapeInterval).
		Msg("Starting scraper loop")

	// Run immediately once
	runScraper(ctx, s, notifier)

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Scraper shutting down")
			return
		case <-ticker.C:
			runScraper(ctx, s, notifier)
		}
	}
}

func runScraper(ctx context.Context, s *scraper.Scraper, notifier *telegram.Notifier) {
	log.Info().Msg("Starting scrape cycle")
	if err := s.Run(ctx); err != nil {
		log.Error().Err(err).Msg("Scraper cycle failed")
		return
	}
	log.Info().Msg("Scraper cycle completed")

	// Announce what we just found. Failures here must not fail the cycle —
	// the drops are already durably recorded and will be retried next pass.
	if notifier != nil {
		if err := notifier.NotifyDrops(ctx); err != nil {
			log.Error().Err(err).Msg("Notification pass failed")
		}
	}
}
