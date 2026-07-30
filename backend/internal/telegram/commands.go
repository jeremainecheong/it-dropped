package telegram

import (
	"context"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/models"
)

// handleCommand routes commands to their handlers
func (b *Bot) handleCommand(message *tgbotapi.Message) {
	switch message.Command() {
	case "start":
		b.handleStart(message)
	case "settings":
		b.handleSettings(message)
	case "regions":
		b.handleRegions(message)
	case "stop":
		b.handleStop(message)
	case "help":
		b.handleHelp(message)
	default:
		b.SendMessage(message.Chat.ID, "Unknown command. Use /help for available commands.")
	}
}

// handleStart handles the /start command
func (b *Bot) handleStart(message *tgbotapi.Message) {
	ctx := context.Background()
	user := message.From

	// Create or update subscriber
	subscriber := &models.Subscriber{
		TelegramID: user.ID,
		ChatID:     message.Chat.ID,
		Username:   user.UserName,
		FirstName:  user.FirstName,
		LastName:   user.LastName,
		Regions:    []string{"us", "uk", "eu", "jp", "au"},
	}

	if err := b.db.UpsertSubscriber(ctx, subscriber); err != nil {
		log.Error().Err(err).Msg("Failed to create subscriber")
		b.SendMessage(message.Chat.ID, "❌ An error occurred. Please try again.")
		return
	}

	text := WelcomeMessage(user.FirstName)
	keyboard := MainMenuKeyboard()
	b.SendMessageWithKeyboard(message.Chat.ID, text, keyboard)
}

// handleSettings handles the /settings command
func (b *Bot) handleSettings(message *tgbotapi.Message) {
	ctx := context.Background()

	subscriber, err := b.db.GetSubscriber(ctx, message.From.ID)
	if err != nil || subscriber == nil {
		b.SendMessage(message.Chat.ID, "Please use /start first to subscribe.")
		return
	}

	text := SettingsMessage(subscriber)
	keyboard := SettingsKeyboard(subscriber)
	b.SendMessageWithKeyboard(message.Chat.ID, text, keyboard)
}

// handleRegions handles the /regions command
func (b *Bot) handleRegions(message *tgbotapi.Message) {
	ctx := context.Background()

	subscriber, err := b.db.GetSubscriber(ctx, message.From.ID)
	if err != nil || subscriber == nil {
		b.SendMessage(message.Chat.ID, "Please use /start first to subscribe.")
		return
	}

	text := "🌍 <b>Select Regions</b>\n\nTap a region to toggle notifications:"
	keyboard := RegionsKeyboard(subscriber.Regions)
	b.SendMessageWithKeyboard(message.Chat.ID, text, keyboard)
}

// handleStop handles the /stop command
func (b *Bot) handleStop(message *tgbotapi.Message) {
	ctx := context.Background()

	if err := b.db.DeactivateSubscriber(ctx, message.From.ID); err != nil {
		log.Error().Err(err).Msg("Failed to deactivate subscriber")
		b.SendMessage(message.Chat.ID, "❌ An error occurred. Please try again.")
		return
	}

	text := "👋 You've been unsubscribed from Dropradar notifications.\n\nUse /start anytime to subscribe again!"
	b.SendMessage(message.Chat.ID, text)
}

// handleHelp handles the /help command
func (b *Bot) handleHelp(message *tgbotapi.Message) {
	b.SendMessage(message.Chat.ID, HelpMessage())
}
