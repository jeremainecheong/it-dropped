package scraper

import (
	"strconv"
	"strings"
	"time"

	"github.com/yourusername/dropradar/internal/models"
)

// Parse converts a Shopify product to our internal Product model
func Parse(sp models.ShopifyProduct, region Region) models.Product {
	p := models.Product{
		ShopifyID:   sp.ID,
		Region:      region.Code,
		Handle:      sp.Handle,
		Title:       sp.Title,
		Vendor:      sp.Vendor,
		ProductType: sp.ProductType,
		Currency:    region.Currency,
		ProductURL:  region.ProductURL(sp.Handle),
		PublishedAt: parseShopifyTime(sp.PublishedAt),
	}

	// Parse tags
	if len(sp.Tags) > 0 {
		p.Tags = sp.Tags
	}

	// Get first image
	if len(sp.Images) > 0 {
		p.ImageURL = sp.Images[0].Src
	}

	// Which option position actually holds the size / colour for THIS product.
	// Stussy returns options [Color, Size], so size lives in option2 — assuming
	// option1 silently filled available_sizes with colour names.
	sizePos := optionPosition(sp, "size")
	colorPos := optionPosition(sp, "color", "colour")

	p.TotalVariants = len(sp.Variants)

	availableSizes := []string{}
	allSizes := []string{}
	seenAvailable := map[string]bool{}
	seenAll := map[string]bool{}
	hasAvailable := false
	availableCount := 0

	for _, v := range sp.Variants {
		// Price comes from the first variant that has one
		if p.Price == 0 {
			if price, err := strconv.ParseFloat(v.Price, 64); err == nil {
				p.Price = price
			}
		}

		// Compare-at price (the "was" price when on sale)
		if v.CompareAtPrice != nil && *v.CompareAtPrice != "" && p.ComparePrice == nil {
			if comparePrice, err := strconv.ParseFloat(*v.CompareAtPrice, 64); err == nil {
				p.ComparePrice = &comparePrice
			}
		}

		// The SKU is the only stable cross-region identity (STYLE-COLOR-SIZE)
		if p.StyleCode == "" {
			if style := styleCodeFromSKU(v.SKU); style != "" {
				p.StyleCode = style
			}
		}
		if p.Color == "" && colorPos > 0 {
			p.Color = strings.TrimSpace(v.Option(colorPos))
		}

		size := variantSize(v, sizePos)

		// Track the FULL size run, not just what's left — "which sizes are gone"
		// is the interesting half and was previously discarded.
		if size != "" && !seenAll[size] {
			seenAll[size] = true
			allSizes = append(allSizes, size)
		}

		if v.Available {
			hasAvailable = true
			availableCount++
			if size != "" && !seenAvailable[size] {
				seenAvailable[size] = true
				availableSizes = append(availableSizes, size)
			}
		}
	}

	// No usable SKU: recover the code from the slug. This covers DSM Singapore
	// (retailer SKUs) and brand-new listings published before their SKUs are
	// populated. The handle itself is the last resort — unique, but it only
	// ever joins against itself.
	if p.StyleCode == "" {
		p.StyleCode = styleCodeFromHandle(sp.Handle)
	}
	if p.StyleCode == "" {
		p.StyleCode = sp.Handle
	}

	p.IsAvailable = hasAvailable
	p.AvailableSizes = availableSizes
	p.AllSizes = allSizes
	p.AvailableVariants = availableCount

	// The raw tokens above stay exactly as the storefront published them; the
	// shared vocabulary goes in its own pair of fields. See normaliseSize.
	p.AllSizesNormalised = normaliseSizes(allSizes)
	p.AvailableSizesNormalised = normaliseSizes(availableSizes)

	return p
}

// sizeAliases maps a size label onto the vocabulary the Stussy-operated stores
// already use. Keys are the output of sizeLookupKey: upper-cased, with hyphens,
// underscores and slashes flattened to single spaces, so "X-Large", "X Large"
// and "x large" all arrive here as "X LARGE".
//
// Only labels with an unambiguous equivalent appear. Anything absent is passed
// through untouched, which is what keeps "EA", "US 5.5" and "7 1/8" intact.
var sizeAliases = map[string]string{
	"XX SMALL":    "XXS",
	"XXSMALL":     "XXS",
	"X SMALL":     "XS",
	"XSMALL":      "XS",
	"EXTRA SMALL": "XS",
	"SMALL":       "S",
	"MEDIUM":      "M",
	"LARGE":       "L",
	"X LARGE":     "XL",
	"XLARGE":      "XL",
	"EXTRA LARGE": "XL",
	"XX LARGE":    "XXL",
	"XXLARGE":     "XXL",
	"2XL":         "XXL",
	"XXX LARGE":   "XXXL",
	"3XL":         "XXXL",
	"ONE SIZE":    "OS",
	"O S":         "OS",
	"OSFA":        "OS",
}

// normaliseSize maps one storefront's size label onto a vocabulary shared with
// the other storefronts.
//
// Measured against the live catalogue, Dover Street Market Singapore and the
// six Stussy-operated stores had ZERO size tokens in common: DSM publishes
// "Size Medium", "Size 30", "Size One Size" where Stussy publishes "M", "30",
// "ONE SIZE". A garment sold in both therefore produced two disjoint sets of
// rows in the size-availability matrix — an "M" row blank for SG and a
// "Size Medium" row blank for everywhere else — and no size alert could ever
// match across regions.
//
// The rule is deliberately conservative: strip the "Size " value prefix, then
// substitute only from sizeAliases. Sizes that are not garment sizes at all —
// "EA" (a belt sold each), "US 5.5" (shoes), "7 1/8" (fitted caps) — hit no
// alias and come back unchanged apart from case. Split runs like "S/M" and
// "L/XL" are mapped side by side, so DSM's "Size Large/X-Large" meets Stussy's
// "L/XL" without the slash being read as anything but a separator.
func normaliseSize(raw string) string {
	s := collapseSpaces(raw)
	if s == "" {
		return ""
	}

	// DSM puts the axis name on the VALUE, not just the option — every one of
	// its 16 tokens begins "Size ". "One Size" must survive, so only a leading
	// occurrence is stripped.
	if trimmed := trimSizeWordPrefix(s); trimmed != "" {
		s = trimmed
	}

	if canon, ok := sizeAliases[sizeLookupKey(s)]; ok {
		return canon
	}

	// A run covering two sizes. Each side is resolved independently and the
	// slash is preserved, so "Large/X-Large" becomes "L/XL" while "7 1/8" —
	// where the slash is a fraction, not a separator — matches no alias on
	// either side and survives verbatim.
	if strings.Contains(s, "/") {
		parts := strings.Split(s, "/")
		for i, part := range parts {
			part = strings.TrimSpace(part)
			if canon, ok := sizeAliases[sizeLookupKey(part)]; ok {
				parts[i] = canon
				continue
			}
			parts[i] = strings.ToUpper(part)
		}
		return strings.Join(parts, "/")
	}

	return strings.ToUpper(s)
}

// normaliseSizes normalises a size run, dropping empties and collapsing
// duplicates. Normalisation can merge two raw tokens into one — a store listing
// both "ONE SIZE" and "OS" yields a single "OS" — so the result is deduped
// again rather than assumed distinct because the input was.
func normaliseSizes(sizes []string) []string {
	out := make([]string, 0, len(sizes))
	seen := make(map[string]bool, len(sizes))
	for _, s := range sizes {
		n := normaliseSize(s)
		if n == "" || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

// trimSizeWordPrefix removes a leading "Size " from a value, returning "" when
// there is nothing to strip or nothing would be left.
func trimSizeWordPrefix(s string) string {
	const prefix = "size "
	if len(s) <= len(prefix) || !strings.EqualFold(s[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(s[len(prefix):])
}

// sizeLookupKey canonicalises a label for the sizeAliases lookup. Hyphens,
// underscores and slashes are separators rather than content here, so "X-Large"
// and "X Large" resolve identically and "O/S" reaches the "O S" entry.
func sizeLookupKey(s string) string {
	return collapseSpaces(strings.ToUpper(sizeSeparators.Replace(s)))
}

var sizeSeparators = strings.NewReplacer("-", " ", "_", " ", "/", " ")

// collapseSpaces trims and reduces internal whitespace runs to one space.
func collapseSpaces(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// optionPosition finds the 1-based position of a named option axis.
// Returns 0 when the product doesn't declare it.
func optionPosition(sp models.ShopifyProduct, names ...string) int {
	for _, opt := range sp.Options {
		got := strings.ToLower(strings.TrimSpace(opt.Name))
		for _, want := range names {
			if got == want {
				if opt.Position > 0 {
					return opt.Position
				}
				return 1
			}
		}
	}
	return 0
}

// variantSize resolves a variant's size using the declared option layout,
// falling back to the variant title for single-axis products (accessories).
func variantSize(v models.ShopifyVariant, sizePos int) string {
	if sizePos > 0 {
		if s := strings.TrimSpace(v.Option(sizePos)); s != "" && s != "Default Title" {
			return s
		}
		return ""
	}

	// No declared Size axis — a one-size item. Use the title if it's meaningful.
	if v.Title != "" && v.Title != "Default Title" {
		return strings.TrimSpace(v.Title)
	}
	return ""
}

// styleCodeFromSKU pulls the style portion out of a Stussy SKU.
// SKUs look like "1140364-OLIV-XS" — the leading segment identifies the
// garment across every regional storefront.
//
// An UNSEGMENTED SKU is rejected on purpose. Every Stussy-operated store
// (US/UK/EU/JP/AU) publishes segmented SKUs; Dover Street Market Singapore
// publishes its own ("800011633GRY00S"), which encodes colour and size and
// belongs to DSM's numbering, not Stussy's. Treating it as a style code gave
// all 250 SG products an identity that matched nothing — a 0% cross-region
// join. The handle is the better source there; see styleCodeFromHandle.
func styleCodeFromSKU(sku string) string {
	sku = strings.TrimSpace(sku)
	if i := strings.Index(sku, "-"); i > 0 {
		if code := strings.ToUpper(sku[:i]); looksLikeStyleCode(code) {
			return code
		}
	}
	return ""
}

// styleCodeFromHandle recovers the style code from a product URL slug.
//
// Both storefront conventions carry it, at opposite ends:
//
//	Stussy    1140364-garment-dyed-ss-tee-olive          -> leading
//	DSM SG    stussy-mens-varsity-zip-hood-navy-ss26-118589 -> trailing
//
// Leading is tried first: it is the authoritative position on Stussy's own
// stores, and it is what rescues a newly-published item whose variants have
// no SKU yet.
func styleCodeFromHandle(handle string) string {
	parts := strings.Split(strings.TrimSpace(handle), "-")
	if len(parts) < 2 {
		return ""
	}

	if code := strings.ToUpper(parts[0]); looksLikeStyleCode(code) {
		return code
	}
	if code := strings.ToUpper(parts[len(parts)-1]); looksLikeStyleCode(code) {
		return code
	}

	// Neither end carries it, but DSM sometimes appends a season marker after
	// the code ("...-blac-1321253-ss26"), pushing it inboard. Accept an
	// interior segment only when exactly one qualifies: a lone candidate is
	// the code, whereas two would be a guess between them. Measured across a
	// six-region catalogue this recovers 28 listings and never has to choose.
	var found string
	for _, part := range parts[1 : len(parts)-1] {
		code := strings.ToUpper(part)
		if !looksLikeStyleCode(code) {
			continue
		}
		if found != "" && found != code {
			return ""
		}
		found = code
	}
	return found
}

// looksLikeStyleCode guards against reading an ordinary slug word as an
// identity. Real codes are short alphanumerics carrying most of their length
// in digits ("118589", "1915000GD", "OM0335"). Requiring four digits is what
// separates them from season markers like "ss26", which sit mid-handle and
// would otherwise qualify.
func looksLikeStyleCode(s string) bool {
	if len(s) < 4 || len(s) > 12 {
		return false
	}

	digits := 0
	for _, r := range s {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r >= 'A' && r <= 'Z':
		default:
			return false
		}
	}
	return digits >= 4
}

// parseShopifyTime parses Shopify's ISO-8601 timestamps, returning nil for
// absent or malformed values rather than a zero time.
func parseShopifyTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil
	}
	return &t
}
