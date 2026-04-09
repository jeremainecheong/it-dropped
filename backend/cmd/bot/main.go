package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
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

	log.Info().Msg("Starting Dropradar Telegram Bot")

	// Initialize database
	db, err := database.New(ctx, cfg.SupabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Initialize Telegram bot
	bot, err := telegram.New(cfg, db)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize Telegram bot")
	}

	// Setup Gin router
	gin.SetMode(cfg.GinMode)
	router := gin.New()
	router.Use(gin.Recovery())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Telegram webhook endpoint
	router.POST("/webhook/telegram", bot.WebhookHandler)

	// Start server
	addr := ":" + cfg.BotPort
	log.Info().Str("addr", addr).Msg("Bot server listening")

	if err := router.Run(addr); err != nil {
		log.Fatal().Err(err).Msg("Bot server failed")
	}
}
