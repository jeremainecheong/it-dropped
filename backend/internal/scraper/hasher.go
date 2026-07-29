package scraper

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/yourusername/dropradar/internal/models"
)

// GenerateHash fingerprints a product for change detection.
//
// IMPORTANT: the hash must cover EVERY column that UpsertProduct writes.
// The scraper skips the upsert when the hash is unchanged, so any persisted
// field left out here would be frozen at its first-seen value forever (e.g.
// a product re-shot with a new image, recategorised, or re-tagged).
func GenerateHash(p *models.Product) string {
	// Sort the slices so ordering churn from the API doesn't churn the hash
	sizes := append([]string(nil), p.AvailableSizes...)
	sort.Strings(sizes)

	allSizes := append([]string(nil), p.AllSizes...)
	sort.Strings(allSizes)

	tags := append([]string(nil), p.Tags...)
	sort.Strings(tags)

	publishedAt := ""
	if p.PublishedAt != nil {
		publishedAt = p.PublishedAt.UTC().Format(time.RFC3339)
	}

	// compare_price participates so sale starts/ends invalidate the hash
	comparePrice := 0.0
	if p.ComparePrice != nil {
		comparePrice = *p.ComparePrice
	}

	input := strings.Join([]string{
		p.Handle,
		p.Title,
		p.Vendor,
		p.ProductType,
		strings.Join(tags, ","),
		fmt.Sprintf("%.2f", p.Price),
		fmt.Sprintf("%.2f", comparePrice),
		p.Currency,
		fmt.Sprintf("%t", p.IsAvailable),
		strings.Join(sizes, ","),
		fmt.Sprintf("%d", p.TotalVariants),
		p.ImageURL,
		p.ProductURL,
		// Added in 007 and originally missed here, which broke the invariant
		// above: a corrected style_code could never reach an existing row,
		// because an otherwise-unchanged product never gets upserted.
		p.StyleCode,
		p.Color,
		strings.Join(allSizes, ","),
		fmt.Sprintf("%d", p.AvailableVariants),
		publishedAt,
	}, "|")

	hash := md5.Sum([]byte(input))
	return hex.EncodeToString(hash[:])
}
