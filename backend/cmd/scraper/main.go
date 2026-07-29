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

	// One-shot mode. DEPLOY.md offers a CronJob deployment as an alternative
	// to the internal loop; without this the binary looped forever inside the
	// CronJob, and SCRAPE_INTERVAL=0 — the obvious way to ask for one cycle —
	// panicked in NewTicker before a single product was fetched.
	if cfg.ScrapeInterval <= 0 {
		log.Info().Msg("SCRAPE_INTERVAL not positive, running a single cycle")
		if err := runScraper(ctx, s, notifier); err != nil {
			// The one-shot path is the CI path (.github/workflows/scrape.yml
			// sets SCRAPE_INTERVAL=0), so this exit code is the only thing
			// standing between a region that scraped nothing and a green tick
			// on the daily run. db.Close is deferred and would not run under
			// os.Exit, so close explicitly first.
			db.Close()
			log.Error().Msg("Exiting non-zero so the scheduled run does not report success")
			os.Exit(1)
		}
		return
	}

	// Scraper loop
	ticker := time.NewTicker(cfg.ScrapeInterval)
	defer ticker.Stop()

	log.Info().
		Dur("interval", cfg.ScrapeInterval).
		Msg("Starting scraper loop")

	// Run immediately once. The loop deliberately ignores the cycle error:
	// a long-running scraper should survive a bad cycle and try again on the
	// next tick. Only the one-shot path above turns it into an exit status.
	_ = runScraper(ctx, s, notifier)

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Scraper shutting down")
			return
		case <-ticker.C:
			_ = runScraper(ctx, s, notifier)
		}
	}
}

// runScraper runs one cycle and reports whether it failed. A cycle fails when
// a region fails entirely — see Scraper.Run. In loop mode the caller logs and
// carries on to the next tick; in one-shot mode the caller turns it into a
// non-zero exit status, which is what makes an unattended daily run visible.
func runScraper(ctx context.Context, s *scraper.Scraper, notifier *telegram.Notifier) error {
	log.Info().Msg("Starting scrape cycle")
	err := s.Run(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Scraper cycle failed")
	} else {
		log.Info().Msg("Scraper cycle completed")
	}

	// Announce what we just found. Failures here must not fail the cycle —
	// the drops are already durably recorded and will be retried next pass.
	// This still runs after a partial failure: the regions that did succeed
	// have drops worth announcing.
	if notifier != nil {
		if notifyErr := notifier.NotifyDrops(ctx); notifyErr != nil {
			log.Error().Err(notifyErr).Msg("Notification pass failed")
		}
	}

	return err
}
