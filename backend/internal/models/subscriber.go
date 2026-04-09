package models

import (
	"time"

	"github.com/google/uuid"
)

// Subscriber represents a Telegram user subscribed to notifications
type Subscriber struct {
	ID               uuid.UUID  `json:"id" db:"id"`
	TelegramID       int64      `json:"telegram_id" db:"telegram_id"`
	ChatID           int64      `json:"chat_id" db:"chat_id"`
	Username         string     `json:"username" db:"username"`
	FirstName        string     `json:"first_name" db:"first_name"`
	LastName         string     `json:"last_name" db:"last_name"`
	Regions          []string   `json:"regions" db:"regions"`
	Keywords         []string   `json:"keywords" db:"keywords"`
	ExcludedKeywords []string   `json:"excluded_keywords" db:"excluded_keywords"`
	MinPrice         *float64   `json:"min_price" db:"min_price"`
	MaxPrice         *float64   `json:"max_price" db:"max_price"`
	NotifyNew        bool       `json:"notify_new" db:"notify_new"`
	NotifyRestock    bool       `json:"notify_restock" db:"notify_restock"`
	NotifyPrice      bool       `json:"notify_price" db:"notify_price"`
	IsActive         bool       `json:"is_active" db:"is_active"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at" db:"updated_at"`
	LastNotified     *time.Time `json:"last_notified" db:"last_notified"`
}
