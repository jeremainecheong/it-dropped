package config

import (
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
	"github.com/rs/zerolog/log"
)

// Config holds all configuration for the application
type Config struct {
	// Database
	DatabaseURL        string `envconfig:"DATABASE_URL"`
	SupabaseURL        string `envconfig:"SUPABASE_URL"` // API URL (https://project.supabase.co)
	SupabaseServiceKey string `envconfig:"SUPABASE_SERVICE_KEY"`

	// Telegram
	TelegramBotToken      string `envconfig:"TELEGRAM_BOT_TOKEN"`
	TelegramWebhookSecret string `envconfig:"TELEGRAM_WEBHOOK_SECRET" default:""`

	// Application
	MockMode bool   `envconfig:"MOCK_MODE" default:"false"`
	Regions  string `envconfig:"REGIONS" default:"us,uk,eu,jp,au,sg"`
	LogLevel string `envconfig:"LOG_LEVEL" default:"info"`
	APIPort  string `envconfig:"API_PORT" default:"8080"`
	BotPort  string `envconfig:"BOT_PORT" default:"8081"`
	GinMode  string `envconfig:"GIN_MODE" default:"release"`

	// Scraper settings
	ScrapeTimeout time.Duration `envconfig:"SCRAPE_TIMEOUT" default:"30s"`
	RequestDelay  time.Duration `envconfig:"REQUEST_DELAY" default:"500ms"`
	// How often the long-running scraper starts a new cycle. Drops don't land
	// more than once every few minutes, and a full cycle is ~24 requests, so
	// 5m keeps us to a polite request rate against the upstream stores.
	// Ignored when the scraper runs as a one-shot CronJob.
	ScrapeInterval time.Duration `envconfig:"SCRAPE_INTERVAL" default:"5m"`
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if it exists (for local development)
	if err := godotenv.Load(); err != nil {
		log.Debug().Msg("No .env file found, using environment variables")
	}

	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// GetRegions returns regions as a slice
func (c *Config) GetRegions() []string {
	return strings.Split(c.Regions, ",")
}
