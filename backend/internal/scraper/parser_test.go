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
