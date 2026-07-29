package scraper

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

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

	tags := append([]string(nil), p.Tags...)
	sort.Strings(tags)

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
	}, "|")

	hash := md5.Sum([]byte(input))
	return hex.EncodeToString(hash[:])
}
