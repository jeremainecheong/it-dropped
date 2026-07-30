package scraper

import (
	"testing"

	"github.com/yourusername/dropradar/internal/models"
)

// A brand-new listing can go live before its SKUs are populated. Nothing about
// visibility may depend on the SKU: the product still needs a style code (so
// cross-region joins work), still needs its sizes, and must still generate a
// "new" drop so it reaches /drops, the shop and notifications.
func TestProductWithoutSKUStillUsable(t *testing.T) {
	sp := models.ShopifyProduct{
		ID:     999,
		Title:  "Unreleased Jacket",
		Handle: "unreleased-jacket",
		Vendor: "Stussy",
		Options: []models.ShopifyOption{
			{Name: "Color", Position: 1},
			{Name: "Size", Position: 2},
		},
		Variants: []models.ShopifyVariant{
			{ID: 1, SKU: "", Price: "180.00", Available: true, Option1: "Black", Option2: "M"},
			{ID: 2, SKU: "", Price: "180.00", Available: false, Option1: "Black", Option2: "L"},
		},
	}

	p := Parse(sp, Regions["us"])

	if p.StyleCode != sp.Handle {
		t.Errorf("StyleCode = %q, want handle fallback %q", p.StyleCode, sp.Handle)
	}
	if !p.IsAvailable {
		t.Error("IsAvailable = false, want true — a SKU-less product must not be hidden")
	}
	if p.Color != "Black" {
		t.Errorf("Color = %q, want %q", p.Color, "Black")
	}
	if got, want := p.AvailableSizes, []string{"M"}; !equalStrings(got, want) {
		t.Errorf("AvailableSizes = %v, want %v", got, want)
	}
	if got, want := p.AllSizes, []string{"M", "L"}; !equalStrings(got, want) {
		t.Errorf("AllSizes = %v, want %v", got, want)
	}

	drops := DetectChanges(map[int64]*models.Product{}, []models.Product{p})
	if len(drops) != 1 || drops[0].ChangeType != models.ChangeTypeNew {
		t.Fatalf("DetectChanges = %+v, want exactly one %q drop", drops, models.ChangeTypeNew)
	}
}

// Size lives at the position the product declares, not always option1.
func TestParseResolvesSizeByDeclaredOptionPosition(t *testing.T) {
	sp := models.ShopifyProduct{
		ID:     1000,
		Handle: "basic-tee",
		Options: []models.ShopifyOption{
			{Name: "Color", Position: 1},
			{Name: "Size", Position: 2},
		},
		Variants: []models.ShopifyVariant{
			{ID: 1, SKU: "1140364-OLIV-XS", Price: "45.00", Available: true, Option1: "Olive", Option2: "XS"},
		},
	}

	p := Parse(sp, Regions["us"])

	if got, want := p.AvailableSizes, []string{"XS"}; !equalStrings(got, want) {
		t.Errorf("AvailableSizes = %v, want %v (colour must never leak into sizes)", got, want)
	}
	if p.StyleCode != "1140364" {
		t.Errorf("StyleCode = %q, want %q", p.StyleCode, "1140364")
	}
}

// Size normalisation. Measured against the live database, Dover Street Market
// Singapore's 16 size tokens and the Stussy stores' 77 had an overlap of
// exactly ZERO, which split every shared garment into two disjoint halves of
// the availability matrix and made cross-region size alerts impossible.
//
// The second half of this table is the part that has to keep working: bags,
// shoes, hats and belts carry sizes that look nothing like S/M/L and must come
// back unharmed.
func TestNormaliseSize(t *testing.T) {
	cases := []struct{ in, want string }{
		// --- Dover Street Market Singapore, every distinct form -------------
		{"Size X-Small", "XS"},
		{"Size Small", "S"},
		{"Size Medium", "M"},
		{"Size Large", "L"},
		{"Size X-Large", "XL"},
		{"Size XX-Large", "XXL"},
		{"Size One Size", "OS"},
		{"Size Large/X-Large", "L/XL"},
		{"Size 26", "26"},
		{"Size 30", "30"},
		{"Size 38", "38"},

		// --- Stussy's own tokens, which must be left where they already are --
		{"XS", "XS"},
		{"S", "S"},
		{"M", "M"},
		{"L", "L"},
		{"XL", "XL"},
		{"XXL", "XXL"},
		{"30", "30"},
		{"S/M", "S/M"},
		{"L/XL", "L/XL"},

		// ONE SIZE is spelt out on the Stussy stores and prefixed on DSM; both
		// sides have to move for the rows to meet.
		{"ONE SIZE", "OS"},
		{"One Size", "OS"},
		{"OS", "OS"},

		// --- legitimate non-garment sizes: bags, shoes, caps, belts ---------
		{"EA", "EA"},
		{"US 4", "US 4"},
		{"US 5.5", "US 5.5"},
		{"US 7", "US 7"},
		{"7 1/8", "7 1/8"},
		{"7 1/4", "7 1/4"},
		{"7 3/8", "7 3/8"},
		{"7 1/2", "7 1/2"},

		// --- shape tolerance ------------------------------------------------
		{"  Size   Medium  ", "M"},
		{"size medium", "M"},
		{"X Large", "XL"},
		{"", ""},
		// The bare word is not a prefix of anything, so it is left alone
		// rather than stripped down to an empty size.
		{"Size", "SIZE"},
	}

	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			if got := normaliseSize(tc.in); got != tc.want {
				t.Errorf("normaliseSize(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// The whole point of the exercise: a garment listed in Singapore and a garment
// listed in the US must produce the same normalised tokens.
func TestNormalisedSizesJoinSingaporeToStussy(t *testing.T) {
	sg := normaliseSizes([]string{"Size Small", "Size Medium", "Size Large", "Size X-Large"})
	us := normaliseSizes([]string{"S", "M", "L", "XL"})

	if !equalStrings(sg, us) {
		t.Fatalf("SG %v and US %v must normalise to the same tokens", sg, us)
	}
}

// Normalisation can map two raw tokens onto one, which would otherwise put a
// duplicate row in the size matrix.
func TestNormaliseSizesDedupes(t *testing.T) {
	got := normaliseSizes([]string{"ONE SIZE", "OS", "One Size", ""})
	if want := []string{"OS"}; !equalStrings(got, want) {
		t.Errorf("normaliseSizes = %v, want %v", got, want)
	}
}

// Parse must persist BOTH: the raw run the store published and the normalised
// one. Overwriting the raw values would make a bad rule unrecoverable.
func TestParseKeepsRawAndNormalisedSizes(t *testing.T) {
	sp := models.ShopifyProduct{
		ID:     1001,
		Handle: "stussy-mens-varsity-zip-hood-navy-ss26-118589",
		Options: []models.ShopifyOption{
			{Name: "Colour", Position: 1},
			{Name: "Size", Position: 2},
		},
		Variants: []models.ShopifyVariant{
			{ID: 1, Price: "329.00", Available: true, Option1: "Navy", Option2: "Size Medium"},
			{ID: 2, Price: "329.00", Available: false, Option1: "Navy", Option2: "Size Large"},
		},
	}

	p := Parse(sp, Regions["us"])

	if got, want := p.AllSizes, []string{"Size Medium", "Size Large"}; !equalStrings(got, want) {
		t.Errorf("AllSizes = %v, want the untouched %v", got, want)
	}
	if got, want := p.AllSizesNormalised, []string{"M", "L"}; !equalStrings(got, want) {
		t.Errorf("AllSizesNormalised = %v, want %v", got, want)
	}
	if got, want := p.AvailableSizes, []string{"Size Medium"}; !equalStrings(got, want) {
		t.Errorf("AvailableSizes = %v, want %v", got, want)
	}
	if got, want := p.AvailableSizesNormalised, []string{"M"}; !equalStrings(got, want) {
		t.Errorf("AvailableSizesNormalised = %v, want %v", got, want)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// Style code resolution across both storefront conventions. The SG cases are
// the ones that mattered: DSM's own SKU encodes colour and size, so trusting
// it gave every SG product an identity that joined with nothing.
func TestStyleCodeResolution(t *testing.T) {
	cases := []struct {
		name   string
		sku    string
		handle string
		want   string
	}{
		{"stussy segmented sku", "1140364-OLIV-XS", "1140364-garment-dyed-ss-tee-olive", "1140364"},
		{"stussy alpha suffix", "1915000GD-SKYB-S", "1915000gd-basic-stussy-crew-garment-dyed-sky-blue", "1915000GD"},
		{"stussy collab code", "OM0335-MOLV-S", "om0335-stussy-mountain-hardwear-tee-mission-olive", "OM0335"},

		{"dsm retailer sku falls through to handle tail", "800011633GRY00S",
			"stussy-mens-varsity-zip-hood-grey-heather-ss26-118589", "118589"},
		{"dsm with no sku at all", "",
			"stussy-mens-varsity-fleece-pant-navy-ss26-116811", "116811"},

		// A new listing with no SKU still recovers its real code from the slug.
		{"no sku, stussy handle", "", "1140364-garment-dyed-ss-tee-olive", "1140364"},

		// DSM appends the season marker after the code on some listings,
		// leaving it at neither end of the handle.
		{"code inboard of a season suffix", "",
			"stussy-mens-ls-thermal-fbla-1140396-ss26", "1140396"},
		{"code inboard, unsegmented retailer sku", "800012044FBLA00S",
			"stussy-stussy-sport-stripe-skullcap-blac-1321253-ss26", "1321253"},

		// Two interior candidates is a guess between them, so decline and let
		// the handle stand rather than pick the wrong identity.
		{"ambiguous interior candidates", "",
			"stussy-112350-tee-116751-ss26", "stussy-112350-tee-116751-ss26"},

		// Nothing code-shaped anywhere: the handle is the last resort.
		{"nothing usable", "", "mystery-item", "mystery-item"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			sp := models.ShopifyProduct{
				Handle:   tc.handle,
				Variants: []models.ShopifyVariant{{SKU: tc.sku, Price: "10.00", Available: true}},
			}
			if got := Parse(sp, Regions["us"]).StyleCode; got != tc.want {
				t.Errorf("StyleCode = %q, want %q", got, tc.want)
			}
		})
	}
}

// A season marker sits mid-handle and is never the trailing segment, but it is
// the closest thing to a false positive, so pin the rule that excludes it.
func TestLooksLikeStyleCodeRejectsSeasonMarkers(t *testing.T) {
	for _, s := range []string{"SS26", "AW25", "TEE", "OLIVE", "", "A1", "TOOLONGCODE12"} {
		if looksLikeStyleCode(s) {
			t.Errorf("looksLikeStyleCode(%q) = true, want false", s)
		}
	}
	for _, s := range []string{"118589", "1140364", "1915000GD", "OM0335"} {
		if !looksLikeStyleCode(s) {
			t.Errorf("looksLikeStyleCode(%q) = false, want true", s)
		}
	}
}

// The hasher's contract is that it covers every persisted column. style_code
// was missing, so a corrected code could never reach an existing row.
func TestHashCoversIdentityColumns(t *testing.T) {
	base := models.Product{
		Handle: "h", Title: "t", Price: 10, Currency: "USD",
		StyleCode: "1140364", Color: "Olive",
		AllSizes: []string{"S", "M"}, AvailableVariants: 2,
	}

	mutations := map[string]func(*models.Product){
		"style_code":         func(p *models.Product) { p.StyleCode = "9999999" },
		"color":              func(p *models.Product) { p.Color = "Black" },
		"all_sizes":          func(p *models.Product) { p.AllSizes = []string{"S", "M", "L"} },
		"available_variants": func(p *models.Product) { p.AvailableVariants = 1 },
	}

	original := GenerateHash(&base)
	for name, mutate := range mutations {
		changed := base
		changed.AllSizes = append([]string(nil), base.AllSizes...)
		mutate(&changed)
		if GenerateHash(&changed) == original {
			t.Errorf("hash unchanged after mutating %s — hash-skip would freeze it", name)
		}
	}
}
