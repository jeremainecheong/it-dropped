package scraper

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yourusername/dropradar/internal/models"
)

// ChangeTypeDelisted lives in models with the other change types — telegram's
// per-subscriber preference switch has to name it, and a constant private to
// this package would have fallen through that switch's `default: return true`
// straight past everyone's settings. This file owns the detection, not the
// vocabulary.
const ChangeTypeDelisted = models.ChangeTypeDelisted

// DelistingNewsWindow bounds how long a product may have been missing and still
// be worth announcing when the delisting check first notices it.
//
// products.last_seen_at only advances for listings the store returned —
// UpsertProduct sets it in its ON CONFLICT branch, TouchProducts sets it for
// unchanged rows — so it freezes the moment a listing leaves the feed. That
// makes it an exact age for a disappearance: yesterday's delisting reads as
// yesterday, one from March still reads as March.
//
// This matters because the first complete fetch after delisting detection ships
// finds EVERY listing that has left the store since the catalogue was seeded,
// all of them still marked is_available = true. Those rows are corrected
// silently. They are history, not news, and telegram.Notifier.shouldNotify
// returns true from its default branch for a change type it does not know, so
// emitting the whole backlog would have pushed one Telegram message per
// long-dead listing to every subscriber.
const DelistingNewsWindow = 7 * 24 * time.Hour

// DetectChanges compares old and new products to detect drops.
//
// A single cycle can produce SEVERAL events for one product — a restock that
// also cut the price is two facts, not one — so each check appends
// independently rather than short-circuiting to the next product.
func DetectChanges(oldProducts map[int64]*models.Product, newProducts []models.Product) []models.Drop {
	var drops []models.Drop

	for i := range newProducts {
		newProduct := &newProducts[i]
		oldProduct, exists := oldProducts[newProduct.ShopifyID]

		if !exists {
			// Brand new listing. Nothing else is meaningful to diff against.
			drops = append(drops, createDrop(newProduct, models.ChangeTypeNew, "", ""))
			continue
		}

		// --- availability transitions -------------------------------------
		switch {
		case !oldProduct.IsAvailable && newProduct.IsAvailable:
			drops = append(drops, createDrop(newProduct, models.ChangeTypeRestock, "unavailable", "available"))
		case oldProduct.IsAvailable && !newProduct.IsAvailable:
			// The moment of peak user interest: it just went.
			drops = append(drops, createDrop(newProduct, models.ChangeTypeSoldOut, "available", "unavailable"))
		}

		// --- price ---------------------------------------------------------
		if newProduct.Price != oldProduct.Price {
			changeType := models.ChangeTypePriceDrop
			if newProduct.Price > oldProduct.Price {
				changeType = models.ChangeTypePriceIncrease
			}
			drops = append(drops, createDrop(newProduct, changeType,
				fmt.Sprintf("%.2f", oldProduct.Price),
				fmt.Sprintf("%.2f", newProduct.Price),
			))
		}

		// --- size-level movement -------------------------------------------
		// Deliberately NOT gated on the product's previous availability: an
		// item coming back from fully sold out is exactly when size detail
		// matters most, and that case used to be skipped.
		if added := sizeDiff(oldProduct.AvailableSizes, newProduct.AvailableSizes); len(added) > 0 {
			// Suppress when the whole product just restocked — that event
			// already says everything, and two pings for one fact is spam.
			if oldProduct.IsAvailable {
				drops = append(drops, createDrop(newProduct, models.ChangeTypeSizeRestock,
					strings.Join(oldProduct.AvailableSizes, ","),
					strings.Join(added, ","),
				))
			}
		}

		if gone := sizeDiff(newProduct.AvailableSizes, oldProduct.AvailableSizes); len(gone) > 0 && newProduct.IsAvailable {
			drops = append(drops, createDrop(newProduct, models.ChangeTypeSizeSoldOut,
				strings.Join(oldProduct.AvailableSizes, ","),
				strings.Join(gone, ","),
			))
		}
	}

	return drops
}

// DetectDelistings turns products the store no longer publishes into
// availability corrections, plus a drop each for the recent ones.
//
// DetectChanges walks the fetched catalogue, so it can only ever see products
// that came back. A listing pulled from the feed was therefore never diffed and
// never touched: it kept is_available = true forever, stayed in the shop grid as
// a buyable item, and kept migration 019's sellout_by_style reporting still_live
// for it — so "still there after six days", which 019 calls half the comparison,
// was wrong in exactly the cases where the garment was gone.
//
// CALLER CONTRACT: `stale` must be the stored rows missing from a COMPLETE fetch
// of the region. Absence from a truncated fetch (scraper.PartialCatalogError)
// means "not reached", not "gone", and acting on it would mark most of a region
// unavailable in a single cycle — far worse than the bug this fixes. scrapeRegion
// is what enforces this; nothing here can tell the two apart.
//
// Returns copies to write, with availability cleared and the fingerprint
// regenerated so that the row's stored hash matches what was written: leaving the
// old hash behind would make a relisting of unchanged content compare equal, and
// the product would come back to the store while staying unavailable here.
func DetectDelistings(stale map[int64]*models.Product, now time.Time) ([]models.Product, []models.Drop) {
	ids := make([]int64, 0, len(stale))
	for id, p := range stale {
		// A row already marked unavailable needs no correction and is not news.
		// This is what makes repeat cycles idempotent: a product stays missing
		// from the feed for months, and only the first cycle writes anything.
		if p == nil || !p.IsAvailable {
			continue
		}
		ids = append(ids, id)
	}
	// Map iteration order is random; sort so the writes, the drops and the log
	// line for one cycle can be read back against each other.
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })

	products := make([]models.Product, 0, len(ids))
	news := make([]bool, 0, len(ids))
	for _, id := range ids {
		gone := *stale[id]
		gone.IsAvailable = false
		// Nothing in a pulled listing is buyable, so the buyable-size columns
		// have to go with the flag: a row that says unavailable while still
		// listing sizes is served to the shop's size filter and to
		// compare/page.tsx, which prints "N sizes available" from it.
		gone.AvailableSizes = []string{}
		gone.AvailableSizesNormalised = []string{}
		gone.AvailableVariants = 0
		// AllSizes is deliberately left alone — it is the size run the listing
		// was published with, which remains true of the garment.
		gone.LastHash = GenerateHash(&gone)

		products = append(products, gone)
		news = append(news, now.Sub(gone.LastSeenAt) <= DelistingNewsWindow)
	}

	// Drops are built in a second pass because createDrop stores &p.ID, and the
	// appends above move the elements those pointers would have aimed at.
	var drops []models.Drop
	for i := range products {
		if !news[i] {
			continue
		}
		drops = append(drops, createDrop(&products[i], ChangeTypeDelisted, "available", "delisted"))
	}

	return products, drops
}

// createDrop creates a Drop from a product
func createDrop(p *models.Product, changeType models.ChangeType, oldValue, newValue string) models.Drop {
	return models.Drop{
		ProductID:      &p.ID,
		ShopifyID:      p.ShopifyID,
		Region:         p.Region,
		ChangeType:     changeType,
		Title:          p.Title,
		Price:          p.Price,
		Currency:       p.Currency,
		ImageURL:       p.ImageURL,
		ProductURL:     p.ProductURL,
		OldValue:       oldValue,
		NewValue:       newValue,
		AvailableSizes: p.AvailableSizes,
	}
}

// sizeDiff returns the entries present in b but not in a.
func sizeDiff(a, b []string) []string {
	inA := make(map[string]bool, len(a))
	for _, s := range a {
		inA[s] = true
	}

	var result []string
	for _, s := range b {
		if !inA[s] {
			result = append(result, s)
		}
	}
	return result
}
