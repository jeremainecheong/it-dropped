package telegram

import (
	"context"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
)

// handleCallback handles inline keyboard callbacks
func (b *Bot) handleCallback(callback *tgbotapi.CallbackQuery) {
	ctx := context.Background()
	data := callback.Data

	// Answer callback to remove loading state
	b.AnswerCallback(callback.ID, "")

	// Parse callback data
	parts := strings.SplitN(data, ":", 2)
	if len(parts) < 2 {
		return
	}

	action := parts[0]
	value := parts[1]

	switch action {
	case "region":
		b.handleRegionToggle(ctx, callback, value)
	case "notify":
		b.handleNotifyToggle(ctx, callback, value)
	case "menu":
		b.handleMenuAction(ctx, callback, value)
	}
}

// handleRegionToggle toggles a region subscription
func (b *Bot) handleRegionToggle(ctx context.Context, callback *tgbotapi.CallbackQuery, region string) {
	subscriber, err := b.db.GetSubscriber(ctx, callback.From.ID)
	if err != nil || subscriber == nil {
		return
	}

	// Toggle region in list
	newRegions := toggleInSlice(subscriber.Regions, region)

	if err := b.db.UpdateSubscriberRegions(ctx, callback.From.ID, newRegions); err != nil {
		log.Error().Err(err).Msg("Failed to update regions")
		return
	}

	// Update keyboard
	keyboard := RegionsKeyboard(newRegions)
	text := "🌍 <b>Select Regions</b>\n\nTap a region to toggle notifications:"
	b.EditMessage(callback.Message.Chat.ID, callback.Message.MessageID, text, &keyboard)
}

// handleNotifyToggle toggles a notification type
func (b *Bot) handleNotifyToggle(ctx context.Context, callback *tgbotapi.CallbackQuery, notifyType string) {
	subscriber, err := b.db.GetSubscriber(ctx, callback.From.ID)
	if err != nil || subscriber == nil {
		return
	}

	// Toggle notification type
	notifyNew := subscriber.NotifyNew
	notifyRestock := subscriber.NotifyRestock
	notifyPrice := subscriber.NotifyPrice

	switch notifyType {
	case "new":
		notifyNew = !notifyNew
	case "restock":
		notifyRestock = !notifyRestock
	case "price":
		notifyPrice = !notifyPrice
	}

	if err := b.db.UpdateSubscriberNotifySettings(ctx, callback.From.ID, notifyNew, notifyRestock, notifyPrice); err != nil {
		log.Error().Err(err).Msg("Failed to update notify settings")
		return
	}

	// Refresh subscriber and update message
	subscriber.NotifyNew = notifyNew
	subscriber.NotifyRestock = notifyRestock
	subscriber.NotifyPrice = notifyPrice

	text := SettingsMessage(subscriber)
	keyboard := SettingsKeyboard(subscriber)
	b.EditMessage(callback.Message.Chat.ID, callback.Message.MessageID, text, &keyboard)
}

// handleMenuAction handles menu navigation
func (b *Bot) handleMenuAction(ctx context.Context, callback *tgbotapi.CallbackQuery, action string) {
	subscriber, err := b.db.GetSubscriber(ctx, callback.From.ID)
	if err != nil || subscriber == nil {
		return
	}

	switch action {
	case "settings":
		text := SettingsMessage(subscriber)
		keyboard := SettingsKeyboard(subscriber)
		b.EditMessage(callback.Message.Chat.ID, callback.Message.MessageID, text, &keyboard)
	case "regions":
		text := "🌍 <b>Select Regions</b>\n\nTap a region to toggle notifications:"
		keyboard := RegionsKeyboard(subscriber.Regions)
		b.EditMessage(callback.Message.Chat.ID, callback.Message.MessageID, text, &keyboard)
	case "back":
		text := "⚙️ <b>Main Menu</b>\n\nWhat would you like to do?"
		keyboard := MainMenuKeyboard()
		b.EditMessage(callback.Message.Chat.ID, callback.Message.MessageID, text, &keyboard)
	}
}

// toggleInSlice adds or removes an item from a slice
func toggleInSlice(slice []string, item string) []string {
	for i, v := range slice {
		if v == item {
			// Remove item
			return append(slice[:i], slice[i+1:]...)
		}
	}
	// Add item
	return append(slice, item)
}
