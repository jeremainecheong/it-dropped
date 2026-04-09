package telegram

import (
	"context"
	"strings"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/database"
	"github.com/yourusername/dropradar/internal/models"
)

// Notifier sends drop notifications to subscribers
type Notifier struct {
	bot *Bot
	db  *database.Client
}

// NewNotifier creates a new Notifier
func NewNotifier(bot *Bot, db *database.Client) *Notifier {
	return &Notifier{
		bot: bot,
		db:  db,
	}
}

// NotifyDrops sends notifications for unnotified drops
func (n *Notifier) NotifyDrops(ctx context.Context) error {
	// Get unnotified drops
	drops, err := n.db.GetUnnotifiedDrops(ctx)
	if err != nil {
		return err
	}

	if len(drops) == 0 {
		return nil
	}

	log.Info().Int("count", len(drops)).Msg("Processing drop notifications")

	// Get active subscribers
	subscribers, err := n.db.GetActiveSubscribers(ctx)
	if err != nil {
		return err
	}

	// Send notifications
	for i := range drops {
		drop := &drops[i]
		n.notifyDrop(ctx, drop, subscribers)
	}

	return nil
}

// notifyDrop sends a single drop notification to matching subscribers
func (n *Notifier) notifyDrop(ctx context.Context, drop *models.Drop, subscribers []models.Subscriber) {
	message := DropNotificationMessage(drop)
	keyboard := DropKeyboard(drop.ProductURL)

	sentCount := 0
	for _, sub := range subscribers {
		// Check if subscriber wants this region
		if !containsString(sub.Regions, drop.Region) {
			continue
		}

		// Check notification preferences
		if !n.shouldNotify(&sub, drop.ChangeType) {
			continue
		}

		// Send notification
		if err := n.bot.SendMessageWithKeyboard(sub.ChatID, message, keyboard); err != nil {
			log.Error().Err(err).
				Int64("chat_id", sub.ChatID).
				Msg("Failed to send notification")
			continue
		}

		sentCount++
	}

	// Mark drop as notified
	if err := n.db.MarkDropNotified(ctx, drop.ID); err != nil {
		log.Error().Err(err).Msg("Failed to mark drop as notified")
	}

	log.Info().
		Str("type", string(drop.ChangeType)).
		Str("title", drop.Title).
		Int("sent", sentCount).
		Msg("Drop notification sent")
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
	default:
		return true
	}
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
