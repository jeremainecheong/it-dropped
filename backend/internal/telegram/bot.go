package telegram

import (
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/dropradar/internal/config"
	"github.com/yourusername/dropradar/internal/database"
)

// Bot represents the Telegram bot
type Bot struct {
	api *tgbotapi.BotAPI
	cfg *config.Config
	db  *database.Client
}

// New creates a new Telegram bot instance
func New(cfg *config.Config, db *database.Client) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(cfg.TelegramBotToken)
	if err != nil {
		return nil, err
	}

	log.Info().
		Str("username", api.Self.UserName).
		Msg("Telegram bot authorized")

	return &Bot{
		api: api,
		cfg: cfg,
		db:  db,
	}, nil
}

// API returns the underlying Telegram Bot API
func (b *Bot) API() *tgbotapi.BotAPI {
	return b.api
}

// SendMessage sends a text message to a chat
func (b *Bot) SendMessage(chatID int64, text string) error {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = tgbotapi.ModeHTML
	_, err := b.api.Send(msg)
	return err
}

// SendMessageWithKeyboard sends a message with an inline keyboard
func (b *Bot) SendMessageWithKeyboard(chatID int64, text string, keyboard tgbotapi.InlineKeyboardMarkup) error {
	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = tgbotapi.ModeHTML
	msg.ReplyMarkup = keyboard
	_, err := b.api.Send(msg)
	return err
}

// EditMessage edits an existing message
func (b *Bot) EditMessage(chatID int64, messageID int, text string, keyboard *tgbotapi.InlineKeyboardMarkup) error {
	edit := tgbotapi.NewEditMessageText(chatID, messageID, text)
	edit.ParseMode = tgbotapi.ModeHTML
	if keyboard != nil {
		edit.ReplyMarkup = keyboard
	}
	_, err := b.api.Send(edit)
	return err
}

// AnswerCallback answers a callback query
func (b *Bot) AnswerCallback(callbackID string, text string) error {
	callback := tgbotapi.NewCallback(callbackID, text)
	_, err := b.api.Request(callback)
	return err
}
