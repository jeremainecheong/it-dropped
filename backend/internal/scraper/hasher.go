package scraper

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/yourusername/dropradar/internal/models"
)

// GenerateHash creates a hash of product attributes that matter for change detection
func GenerateHash(p *models.Product) string {
	// Sort sizes for consistent hashing
	sizes := make([]string, len(p.AvailableSizes))
	copy(sizes, p.AvailableSizes)
	sort.Strings(sizes)

	// Build hash input
	input := fmt.Sprintf(
		"%s|%.2f|%t|%s",
		p.Title,
		p.Price,
		p.IsAvailable,
		strings.Join(sizes, ","),
	)

	hash := md5.Sum([]byte(input))
	return hex.EncodeToString(hash[:])
}
