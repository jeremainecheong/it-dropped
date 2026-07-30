package telegram

import (
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/yourusername/dropradar/internal/models"
)

// Region labels for display
var regionLabels = map[string]string{
	"us": "🇺🇸 US",
	"uk": "🇬🇧 UK",
	"eu": "🇪🇺 EU",
	"jp": "🇯🇵 JP",
	"au": "🇦🇺 AU",
}

// MainMenuKeyboard creates the main menu keyboard
func MainMenuKeyboard() tgbotapi.InlineKeyboardMarkup {
	return tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("⚙️ Settings", "menu:settings"),
			tgbotapi.NewInlineKeyboardButtonData("🌍 Regions", "menu:regions"),
		),
	)
}

// SettingsKeyboard creates the settings keyboard
func SettingsKeyboard(s *models.Subscriber) tgbotapi.InlineKeyboardMarkup {
	checkNew := "☐"
	if s.NotifyNew {
		checkNew = "☑"
	}
	checkRestock := "☐"
	if s.NotifyRestock {
		checkRestock = "☑"
	}
	checkPrice := "☐"
	if s.NotifyPrice {
		checkPrice = "☑"
	}

	return tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(checkNew+" New Drops", "notify:new"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(checkRestock+" Restocks", "notify:restock"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(checkPrice+" Price Changes", "notify:price"),
		),
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData("🌍 Regions", "menu:regions"),
			tgbotapi.NewInlineKeyboardButtonData("◀️ Back", "menu:back"),
		),
	)
}

// RegionsKeyboard creates the region selection keyboard
func RegionsKeyboard(activeRegions []string) tgbotapi.InlineKeyboardMarkup {
	activeSet := make(map[string]bool)
	for _, r := range activeRegions {
		activeSet[r] = true
	}

	regions := []string{"us", "uk", "eu", "jp", "au"}
	var rows [][]tgbotapi.InlineKeyboardButton

	for _, region := range regions {
		label := regionLabels[region]
		if activeSet[region] {
			label = "✅ " + label
		} else {
			label = "⬜ " + label
		}
		rows = append(rows, tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonData(label, "region:"+region),
		))
	}

	// Add back button
	rows = append(rows, tgbotapi.NewInlineKeyboardRow(
		tgbotapi.NewInlineKeyboardButtonData("◀️ Back", "menu:back"),
	))

	return tgbotapi.NewInlineKeyboardMarkup(rows...)
}

// DropKeyboard creates a keyboard for drop notifications
func DropKeyboard(productURL string) tgbotapi.InlineKeyboardMarkup {
	return tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonURL("🛒 View Product", productURL),
		),
	)
}
