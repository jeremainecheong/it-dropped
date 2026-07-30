package database

import (
	"reflect"
	"testing"

	"github.com/google/uuid"
)

func strPtr(s string) *string { return &s }

func TestBucketForType(t *testing.T) {
	tests := []struct {
		name        string
		productType string
		want        string
	}{
		// One representative spelling per storefront style.
		{"us spelling", "Mens Short Sleeve T-Shirt", "tops"},
		{"jp shouting", "TEES", "tops"},
		{"dsm dash variant", "Accessories - Bucket Hat", "headwear"},
		{"dsm plain variant", "Accessories Bucket Hat", "headwear"},
		{"bottoms", "Mens Sweatpant", "bottoms"},
		{"outerwear", "JACKETS", "outerwear"},
		{"accessories", "Accessories Key Chain", "accessories"},
		{"footwear", "SNEAKERS", "footwear"},

		// Case variance: the map must not care how the storefront shouts.
		{"lowered", "tees", "tops"},
		{"mixed case", "Hoodie", "tops"},
		{"padded", "  SWEATERS  ", "tops"},

		// Outside the vocabulary is "", not a panic and not a guess.
		{"gift card", "Gift Card", ""},
		{"empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := bucketForType(tt.productType); got != tt.want {
				t.Errorf("bucketForType(%q) = %q, want %q", tt.productType, got, tt.want)
			}
		})
	}
}

func TestBucketLabelsCoverBuckets(t *testing.T) {
	// A bucket without a label would render "3 new tops in US" — lowercase key
	// leaking into a user-facing title.
	for bucket := range categoryBuckets {
		if bucketLabels[bucket] == "" {
			t.Errorf("bucket %q has no label", bucket)
		}
	}
	for bucket := range bucketLabels {
		if _, ok := categoryBuckets[bucket]; !ok {
			t.Errorf("label for unknown bucket %q", bucket)
		}
	}
}

func TestBuildCategoryDigests(t *testing.T) {
	alice := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	bob := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	t.Run("groups by user, category and drop region", func(t *testing.T) {
		watches := []categoryWatch{
			{UserID: alice, Category: "tops"},                     // all regions
			{UserID: bob, Category: "tops", Region: strPtr("us")}, // US only
		}
		drops := []bucketedDrop{
			{Bucket: "tops", Region: "us", Title: "8 Ball Tee"},
			{Bucket: "tops", Region: "us", Title: "Stock Logo Tee"},
			{Bucket: "tops", Region: "jp", Title: "Basic Stussy Tee"},
			{Bucket: "footwear", Region: "us", Title: "Idol Sneaker"},
		}

		got := buildCategoryDigests(watches, drops)
		want := []categoryDigest{
			{UserID: alice, Category: "tops", Region: "jp", Titles: []string{"Basic Stussy Tee"}},
			{UserID: alice, Category: "tops", Region: "us", Titles: []string{"8 Ball Tee", "Stock Logo Tee"}},
			{UserID: bob, Category: "tops", Region: "us", Titles: []string{"8 Ball Tee", "Stock Logo Tee"}},
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("digests = %+v, want %+v", got, want)
		}
	})

	t.Run("overlapping watches yield one digest per user", func(t *testing.T) {
		// A user can hold both a region-less watch and a US-pinned one on the
		// same category (the unique index allows it); the same drop must not
		// be counted twice for them.
		watches := []categoryWatch{
			{UserID: alice, Category: "tops"},
			{UserID: alice, Category: "tops", Region: strPtr("us")},
		}
		drops := []bucketedDrop{
			{Bucket: "tops", Region: "us", Title: "8 Ball Tee"},
		}

		got := buildCategoryDigests(watches, drops)
		want := []categoryDigest{
			{UserID: alice, Category: "tops", Region: "us", Titles: []string{"8 Ball Tee"}},
		}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("digests = %+v, want %+v", got, want)
		}
	})

	t.Run("region-pinned watch ignores other regions", func(t *testing.T) {
		watches := []categoryWatch{
			{UserID: bob, Category: "headwear", Region: strPtr("sg")},
		}
		drops := []bucketedDrop{
			{Bucket: "headwear", Region: "jp", Title: "Big Logo Bucket Hat"},
		}
		if got := buildCategoryDigests(watches, drops); len(got) != 0 {
			t.Errorf("expected no digests, got %+v", got)
		}
	})

	t.Run("no watches, no digests", func(t *testing.T) {
		drops := []bucketedDrop{{Bucket: "tops", Region: "us", Title: "8 Ball Tee"}}
		if got := buildCategoryDigests(nil, drops); len(got) != 0 {
			t.Errorf("expected no digests, got %+v", got)
		}
	})
}

func TestDigestTitle(t *testing.T) {
	if got := digestTitle(3, "tops", "us"); got != "3 new Tops in US" {
		t.Errorf("digestTitle = %q", got)
	}
	if got := digestTitle(1, "headwear", "sg"); got != "1 new Headwear in SG" {
		t.Errorf("digestTitle = %q", got)
	}
}

func TestDigestBody(t *testing.T) {
	tests := []struct {
		name   string
		titles []string
		want   string
	}{
		{"one", []string{"A"}, "A"},
		{"three fit", []string{"A", "B", "C"}, "A, B, C"},
		{"four folds", []string{"A", "B", "C", "D"}, "A, B, C and 1 more"},
		{"many fold", []string{"A", "B", "C", "D", "E", "F"}, "A, B, C and 3 more"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := digestBody(tt.titles); got != tt.want {
				t.Errorf("digestBody(%v) = %q, want %q", tt.titles, got, tt.want)
			}
		})
	}
}
