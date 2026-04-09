package telegram

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/rs/zerolog/log"
)

// WebhookHandler handles incoming Telegram webhook requests
func (b *Bot) WebhookHandler(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Error().Err(err).Msg("Failed to read webhook body")
		c.Status(http.StatusBadRequest)
		return
	}

	var update tgbotapi.Update
	if err := json.Unmarshal(body, &update); err != nil {
		log.Error().Err(err).Msg("Failed to parse webhook update")
		c.Status(http.StatusBadRequest)
		return
	}

	// Process update asynchronously
	go b.processUpdate(update)

	c.Status(http.StatusOK)
}

// processUpdate handles a single update
func (b *Bot) processUpdate(update tgbotapi.Update) {
	ctx := log.With().Int("update_id", update.UpdateID).Logger()

	// Handle callback queries (inline keyboard buttons)
	if update.CallbackQuery != nil {
		ctx.Debug().
			Str("data", update.CallbackQuery.Data).
			Msg("Processing callback query")
		b.handleCallback(update.CallbackQuery)
		return
	}

	// Handle messages
	if update.Message != nil {
		// Handle commands
		if update.Message.IsCommand() {
			ctx.Debug().
				Str("command", update.Message.Command()).
				Msg("Processing command")
			b.handleCommand(update.Message)
			return
		}

		// Handle regular messages (could be for future use)
		ctx.Debug().Msg("Received non-command message, ignoring")
	}
}
