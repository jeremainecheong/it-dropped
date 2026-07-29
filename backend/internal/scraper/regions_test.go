package scraper

import "testing"

// Dover Street Market Singapore lists the same brand under two spellings.
// An exact-match vendor filter silently discarded 50 of 345 products.
func TestMatchesVendorFoldsAccentsAndCase(t *testing.T) {
	sg := Regions["sg"]

	for _, vendor := range []string{"Stussy", "Stüssy", "STUSSY", "stüssy", " Stussy "} {
		if !sg.MatchesVendor(vendor) {
			t.Errorf("MatchesVendor(%q) = false, want true", vendor)
		}
	}

	for _, vendor := range []string{"Comme des Garçons", "Nike", ""} {
		if sg.MatchesVendor(vendor) {
			t.Errorf("MatchesVendor(%q) = true, want false", vendor)
		}
	}
}

func TestMatchesVendorPassesEverythingWhenUnset(t *testing.T) {
	us := Regions["us"]
	if us.VendorFilter != "" {
		t.Fatalf("us region unexpectedly has a vendor filter: %q", us.VendorFilter)
	}
	for _, vendor := range []string{"Stussy", "Anything", ""} {
		if !us.MatchesVendor(vendor) {
			t.Errorf("MatchesVendor(%q) = false, want true for unfiltered region", vendor)
		}
	}
}
