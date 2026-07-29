package telegram

import (
	"context"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/database"
	"github.com/yourusername/dropradar/internal/models"
)

const (
	// sendInterval throttles outbound messages. Telegram allows roughly 30
	// messages/second overall; 40ms leaves headroom and keeps a large fan-out
	// from tripping a global 429.
	sendInterval = 40 * time.Millisecond

	// maxDropAge is a safety fuse. Anything older than this is history, not
	// news — if the notifier has been off (or a backlog built up during an
	// outage) we must not blast subscribers with thousands of stale drops.
	maxDropAge = 30 * time.Minute
)

// Notifier sends drop notifications to subscribers
type Notifier struct {
	bot  *Bot
	db   *database.Client
	rate <-chan time.Time
}

// NewNotifier creates a new Notifier
func NewNotifier(bot *Bot, db *database.Client) *Notifier {
	return &Notifier{
		bot: bot,
		db:  db,
	}
}

// NotifyDrops sends notifications for unnotified drops.
//
// Drops older than maxDropAge are retired without sending, so switching the
// notifier on (or recovering from downtime) can never produce a message storm.
func (n *Notifier) NotifyDrops(ctx context.Context) error {
	drops, err := n.db.GetUnnotifiedDrops(ctx)
	if err != nil {
		return err
	}
	if len(drops) == 0 {
		return nil
	}

	subscribers, err := n.db.GetActiveSubscribers(ctx)
	if err != nil {
		return err
	}

	throttle := time.NewTicker(sendInterval)
	defer throttle.Stop()
	n.rate = throttle.C

	cutoff := time.Now().Add(-maxDropAge)
	var sent, retired int

	for i := range drops {
		drop := &drops[i]

		if drop.DetectedAt.Before(cutoff) {
			// Too old to be useful — retire it quietly so it stops being
			// re-selected every cycle.
			if err := n.db.MarkDropNotified(ctx, drop.ID); err != nil {
				log.Error().Err(err).Msg("Failed to retire stale drop")
			}
			retired++
			continue
		}

		if err := ctx.Err(); err != nil {
			return err
		}

		if n.notifyDrop(ctx, drop, subscribers) {
			sent++
		}
	}

	log.Info().
		Int("delivered", sent).
		Int("retired_stale", retired).
		Int("subscribers", len(subscribers)).
		Msg("Drop notifications processed")

	return nil
}

// notifyDrop sends a single drop to matching subscribers.
// It reports whether the drop was successfully accounted for.
func (n *Notifier) notifyDrop(ctx context.Context, drop *models.Drop, subscribers []models.Subscriber) bool {
	message := DropNotificationMessage(drop)
	keyboard := DropKeyboard(drop.ProductURL)

	var matched, sentCount, failed int

	for i := range subscribers {
		sub := &subscribers[i]

		if !containsString(sub.Regions, drop.Region) {
			continue
		}
		if !n.shouldNotify(sub, drop.ChangeType) {
			continue
		}
		if !matchesFilters(sub, drop) {
			continue
		}
		matched++

		// Pace sends so a wide fan-out doesn't trip Telegram's rate limit.
		if n.rate != nil {
			select {
			case <-n.rate:
			case <-ctx.Done():
				return false
			}
		}

		if err := n.bot.SendMessageWithKeyboard(sub.ChatID, message, keyboard); err != nil {
			log.Error().Err(err).
				Int64("chat_id", sub.ChatID).
				Msg("Failed to send notification")
			failed++
			continue
		}
		sentCount++
	}

	// Only mark delivered if we didn't fail everyone we tried to reach.
	// Marking on total failure silently loses the event forever.
	if matched > 0 && sentCount == 0 {
		log.Warn().
			Str("title", drop.Title).
			Int("failed", failed).
			Msg("All sends failed; leaving drop unnotified for retry")
		return false
	}

	if err := n.db.MarkDropNotified(ctx, drop.ID); err != nil {
		log.Error().Err(err).Msg("Failed to mark drop as notified")
		return false
	}

	if sentCount > 0 {
		log.Info().
			Str("type", string(drop.ChangeType)).
			Str("title", drop.Title).
			Int("sent", sentCount).
			Msg("Drop notification sent")
	}
	return true
}

// shouldNotify checks if a subscriber wants this type of notification
func (n *Notifier) shouldNotify(sub *models.Subscriber, changeType models.ChangeType) bool {
	switch changeType {
	case models.ChangeTypeNew:
		return sub.NotifyNew
	case models.ChangeTypeRestock, models.ChangeTypeSizeRestock:
		return sub.NotifyRestock
	case models.ChangeTypePriceDrop, models.ChangeTypePriceIncrease:
		return sub.NotifyPrice
	case models.ChangeTypeSoldOut, models.ChangeTypeSizeSoldOut:
		// Sell-outs ride the restock preference: someone who cares that an
		// item came back also cares that it went.
		return sub.NotifyRestock
	default:
		return true
	}
}

// matchesFilters applies the per-subscriber keyword and price-band filters.
// These columns have always been stored and loaded but never consulted, which
// made the bot a firehose — the main reason people mute drop monitors.
func matchesFilters(sub *models.Subscriber, drop *models.Drop) bool {
	title := strings.ToLower(drop.Title)

	for _, kw := range sub.ExcludedKeywords {
		if kw = strings.ToLower(strings.TrimSpace(kw)); kw != "" && strings.Contains(title, kw) {
			return false
		}
	}

	if len(sub.Keywords) > 0 {
		matched := false
		for _, kw := range sub.Keywords {
			if kw = strings.ToLower(strings.TrimSpace(kw)); kw != "" && strings.Contains(title, kw) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}

	// Price bands are compared in approximate USD: a subscriber asking for
	// "under 200" means 200 dollars, not 200 yen.
	priceUSD := toUSD(drop.Price, drop.Currency)
	if sub.MinPrice != nil && priceUSD < *sub.MinPrice {
		return false
	}
	if sub.MaxPrice != nil && priceUSD > *sub.MaxPrice {
		return false
	}

	return true
}

// fxToUSD mirrors frontend/lib/currency.ts and database.priceUSDExpr.
var fxToUSD = map[string]float64{
	"USD": 1.0, "GBP": 1.27, "EUR": 1.08, "JPY": 0.0067, "AUD": 0.65, "SGD": 0.74,
}

func toUSD(price float64, currency string) float64 {
	if rate, ok := fxToUSD[strings.ToUpper(currency)]; ok {
		return price * rate
	}
	return price
}

// containsString checks if a slice contains a string
func containsString(slice []string, item string) bool {
	for _, s := range slice {
		if strings.EqualFold(s, item) {
			return true
		}
	}
	return false
}
