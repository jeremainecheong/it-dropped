package telegram

import (
	"fmt"
	"strings"

	"github.com/yourusername/dropradar/internal/models"
)

// WelcomeMessage generates the welcome message
func WelcomeMessage(firstName string) string {
	name := firstName
	if name == "" {
		name = "there"
	}

	return fmt.Sprintf(`👋 <b>Welcome to Dropradar, %s!</b>

🔔 You're now subscribed to Stüssy drop notifications.

<b>What you'll get:</b>
• 🆕 New product alerts
• 🔄 Restock notifications
• 💰 Price drop alerts

<b>Active regions:</b> 🇺🇸 🇬🇧 🇪🇺 🇯🇵 🇦🇺

Use the buttons below to customize your preferences.`, name)
}

// SettingsMessage generates the settings message
func SettingsMessage(s *models.Subscriber) string {
	regions := strings.Join(s.Regions, ", ")
	if regions == "" {
		regions = "None"
	}

	notifyTypes := []string{}
	if s.NotifyNew {
		notifyTypes = append(notifyTypes, "New drops")
	}
	if s.NotifyRestock {
		notifyTypes = append(notifyTypes, "Restocks")
	}
	if s.NotifyPrice {
		notifyTypes = append(notifyTypes, "Price changes")
	}

	notifications := strings.Join(notifyTypes, ", ")
	if notifications == "" {
		notifications = "None"
	}

	return fmt.Sprintf(`⚙️ <b>Your Settings</b>

<b>Regions:</b> %s
<b>Notifications:</b> %s

Tap the options below to toggle:`, strings.ToUpper(regions), notifications)
}

// HelpMessage generates the help message
func HelpMessage() string {
	return `📚 <b>Dropradar Commands</b>

/start - Subscribe to notifications
/settings - View and edit your settings
/regions - Select which regions to monitor
/stop - Unsubscribe from notifications
/help - Show this help message

<b>About Dropradar</b>
Dropradar monitors Stüssy stores across 5 regions and sends you instant notifications when:
• 🆕 New products drop
• 🔄 Sold-out items restock
• 💰 Prices change`
}

// DropNotificationMessage formats a drop notification
func DropNotificationMessage(drop *models.Drop) string {
	var icon, typeLabel string

	switch drop.ChangeType {
	case models.ChangeTypeNew:
		icon = "🆕"
		typeLabel = "NEW DROP"
	case models.ChangeTypeRestock:
		icon = "🔄"
		typeLabel = "RESTOCK"
	case models.ChangeTypeSizeRestock:
		icon = "📦"
		typeLabel = "SIZE RESTOCK"
	case models.ChangeTypePriceDrop:
		icon = "💰"
		typeLabel = "PRICE DROP"
	case models.ChangeTypePriceIncrease:
		icon = "📈"
		typeLabel = "PRICE INCREASE"
	case models.ChangeTypeSoldOut, models.ChangeTypeSizeSoldOut:
		icon = "⛔"
		typeLabel = "SOLD OUT"
	case models.ChangeTypeDelisted:
		// "Sold out" would be a claim we cannot make: all we observed is that
		// the listing is no longer in the feed.
		icon = "🗑"
		typeLabel = "PULLED"
	default:
		icon = "📢"
		typeLabel = "UPDATE"
	}

	regionFlag := map[string]string{
		"us": "🇺🇸",
		"uk": "🇬🇧",
		"eu": "🇪🇺",
		"jp": "🇯🇵",
		"au": "🇦🇺",
	}[drop.Region]

	msg := fmt.Sprintf("%s <b>%s</b> - %s\n\n", icon, typeLabel, regionFlag)
	msg += fmt.Sprintf("<b>%s</b>\n", drop.Title)
	msg += fmt.Sprintf("💵 %s %.2f\n", drop.Currency, drop.Price)

	if drop.OldValue != "" && drop.NewValue != "" {
		msg += fmt.Sprintf("📊 %s → %s\n", drop.OldValue, drop.NewValue)
	}

	if len(drop.AvailableSizes) > 0 {
		msg += fmt.Sprintf("\n📏 Sizes: %s", strings.Join(drop.AvailableSizes, ", "))
	}

	return msg
}
