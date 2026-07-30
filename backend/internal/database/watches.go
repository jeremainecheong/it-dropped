package database

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/yourusername/dropradar/internal/models"
)

// categoryBuckets is the backend's copy of the six-bucket category vocabulary:
// bucket key -> the raw product_type spellings the storefronts use for it.
//
// This mirrors frontend/lib/categories.ts, and the two must change in
// lockstep — a product_type added or moved on one side and not the other means
// watches fire on a different set of garments than the shop's chips show. The
// bucket keys are what category_watches.category stores; the raw strings never
// leave the matcher.
var categoryBuckets = map[string][]string{
	"tops": {
		"Mens Short Sleeve T-Shirt", "Mens Long Sleeve T-Shirt", "TEES",
		"Mens Short Sleeve Shirt", "Mens Long Sleeve Shirt", "SHIRTS",
		"Mens Short Sleeve Knit", "Mens Long Sleeve Knit", "KNIT TOPS",
		"Mens Long Sleeve Sweater", "SWEATERS",
		"Mens Long Sleeve Sweatshirt", "HOODIE",
	},
	"bottoms": {
		"Mens Pant", "Mens Regular Pant", "PANTS", "Jeans",
		"Mens Short", "Mens Swim Bottom",
		"Mens Sweatpant",
	},
	"outerwear": {
		"Mens Long Sleeve Outerwear", "JACKETS",
		"Mens Sleeveless Outerwear", "VESTS",
	},
	"headwear": {
		"Accessories Ball Cap",
		"Accessories Beanie", "Accessories Not Applicable Beanie",
		"Accessories Bucket Hat", "Accessories - Bucket Hat", "HATS",
	},
	"accessories": {
		"Accessories Backpack", "Accessories Shoulder Bag", "Accessories Side Bag", "Accessories Tote Bag", "BACKPACKS",
		"Accessories Belt", "Accessories Belts", "Accessories Not Applicable Belts", "BELTS",
		"Accessories Wallet",
		"Accessories Sunglasses", "EYEWEAR",
		"Accessories Bottle", "Accessories Brief", "Accessories Key Chain", "Accessories Necktie",
		"Accessories Novelty Home", "Accessories Socks", "Accessories Not Applicable Key Chain",
	},
	"footwear": {
		"Mens Shoes", "SNEAKERS",
	},
}

// bucketLabels are the display names used in notification titles. Kept
// explicit rather than derived from the key so the title reads exactly like
// the shop's chips.
var bucketLabels = map[string]string{
	"tops":        "Tops",
	"bottoms":     "Bottoms",
	"outerwear":   "Outerwear",
	"headwear":    "Headwear",
	"accessories": "Accessories",
	"footwear":    "Footwear",
}

// typeToBucket inverts categoryBuckets for lookup. Case-insensitive for the
// same reason as the frontend's map: "TEES" today could plausibly arrive as
// "Tees" after a Shopify migration, and a silent vocabulary miss just makes
// watches quietly stop firing.
var typeToBucket = func() map[string]string {
	m := make(map[string]string)
	for bucket, types := range categoryBuckets {
		for _, t := range types {
			m[strings.ToLower(strings.TrimSpace(t))] = bucket
		}
	}
	return m
}()

// bucketForType resolves a raw product_type to its bucket key, or "" for
// types outside the vocabulary (gift cards and the like) — not an error,
// just nothing anybody can watch.
func bucketForType(productType string) string {
	return typeToBucket[strings.ToLower(strings.TrimSpace(productType))]
}

// categoryWatch is one active category_watches row, as the matcher sees it.
type categoryWatch struct {
	UserID uuid.UUID
	// Bucket key ("tops").
	Category string
	// nil means every region.
	Region *string
	// Stored but not yet consulted — see the note in MatchCategoryWatches.
	MySizesOnly bool
}

// bucketedDrop is a 'new' drop after its product_type has been resolved to a
// bucket. Only what the digest needs is carried.
type bucketedDrop struct {
	Bucket string
	Region string
	Title  string
}

// categoryDigest is one notification row to be: everything a user's matched
// drops in one (category, region) collapse into.
type categoryDigest struct {
	UserID   uuid.UUID
	Category string
	Region   string
	Titles   []string
}

// MatchCategoryWatches fires "tell me when new Tops appear" watches against a
// cycle's drops, as digests: one notification per (user, category, region of
// the drops), never one per drop — a Friday drop landing forty tees at once
// must ring the bell once, not forty times.
//
// Idempotence within a cycle is the grouping itself; across cycles a new drop
// is a new event, so unlike the alert matchers there is no triggered flag to
// flip or re-arm.
//
// Returns the number of notification rows created.
func (c *Client) MatchCategoryWatches(ctx context.Context, drops []models.Drop) (int, error) {
	// Guard on the table existing so the scraper keeps working against a
	// database migration 025 has not been applied to. to_regclass returns NULL
	// rather than erroring for a missing relation, which is the whole reason
	// it is used here.
	var reg *string
	if err := c.pool.QueryRow(ctx,
		`SELECT to_regclass('public.category_watches')::text`).Scan(&reg); err != nil {
		return 0, fmt.Errorf("failed to probe for category_watches: %w", err)
	}
	if reg == nil {
		return 0, nil
	}

	// Only appearances count. A restock or a price move is not a new garment,
	// and a drop without a ProductID belongs to a product that failed to write
	// (scraper.go nils the link on purpose).
	var newDrops []*models.Drop
	ids := make([]uuid.UUID, 0, len(drops))
	seen := make(map[uuid.UUID]bool)
	for i := range drops {
		d := &drops[i]
		if d.ChangeType != models.ChangeTypeNew || d.ProductID == nil {
			continue
		}
		newDrops = append(newDrops, d)
		if !seen[*d.ProductID] {
			seen[*d.ProductID] = true
			ids = append(ids, *d.ProductID)
		}
	}
	if len(newDrops) == 0 {
		return 0, nil
	}

	// Drops don't carry product_type, so fetch it for the whole batch in one
	// query rather than one round trip per drop.
	typeByID := make(map[uuid.UUID]string, len(ids))
	rows, err := c.pool.Query(ctx,
		`SELECT id, product_type FROM products WHERE id = ANY($1)`, ids)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch product types for category watches: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id uuid.UUID
		var pt string
		if err := rows.Scan(&id, &pt); err != nil {
			return 0, fmt.Errorf("failed to fetch product types for category watches: %w", err)
		}
		typeByID[id] = pt
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("failed to fetch product types for category watches: %w", err)
	}

	bucketed := make([]bucketedDrop, 0, len(newDrops))
	buckets := make(map[string]bool)
	for _, d := range newDrops {
		bucket := bucketForType(typeByID[*d.ProductID])
		if bucket == "" {
			continue
		}
		bucketed = append(bucketed, bucketedDrop{Bucket: bucket, Region: d.Region, Title: d.Title})
		buckets[bucket] = true
	}
	if len(bucketed) == 0 {
		return 0, nil
	}

	bucketKeys := make([]string, 0, len(buckets))
	for b := range buckets {
		bucketKeys = append(bucketKeys, b)
	}

	// The 'drops' preference gates these the same way it gates region alerts:
	// a muted bell must not fill up while muted.
	watchRows, err := c.pool.Query(ctx, `
		SELECT user_id, category, region, my_sizes_only
		FROM category_watches
		WHERE is_active = TRUE
		  AND category = ANY($1)
		  AND wants_notification(user_id, 'drops')`,
		bucketKeys,
	)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch category watches: %w", err)
	}
	defer watchRows.Close()

	var watches []categoryWatch
	for watchRows.Next() {
		var w categoryWatch
		if err := watchRows.Scan(&w.UserID, &w.Category, &w.Region, &w.MySizesOnly); err != nil {
			return 0, fmt.Errorf("failed to fetch category watches: %w", err)
		}
		watches = append(watches, w)
	}
	if err := watchRows.Err(); err != nil {
		return 0, fmt.Errorf("failed to fetch category watches: %w", err)
	}

	// my_sizes_only is deliberately not applied yet: the user's saved sizes
	// live client-side (localStorage) in this release, so the matcher has
	// nothing to filter against. The column exists so the toggle survives
	// until sizes move server-side; until then it is treated as false.

	digests := buildCategoryDigests(watches, bucketed)

	created := 0
	for _, dg := range digests {
		tag, err := c.pool.Exec(ctx, `
			INSERT INTO notifications (user_id, type, title, body, link)
			VALUES ($1, 'new_product', $2, $3, $4)`,
			dg.UserID,
			digestTitle(len(dg.Titles), dg.Category, dg.Region),
			digestBody(dg.Titles),
			fmt.Sprintf("/drops?region=%s", dg.Region),
		)
		if err != nil {
			return created, fmt.Errorf("failed to insert category watch digest: %w", err)
		}
		created += int(tag.RowsAffected())
	}
	return created, nil
}

// buildCategoryDigests collapses (watch x drop) matches into one digest per
// (user, category, region of the drop).
//
// A user can legitimately hold two watches that match the same drop — one
// pinned to 'us' and one region-less — and must still get a single row for
// it, so matching is per (drop, user), not per (drop, watch). Titles keep
// drop order; the digests themselves are sorted so output is deterministic.
func buildCategoryDigests(watches []categoryWatch, drops []bucketedDrop) []categoryDigest {
	type key struct {
		user     uuid.UUID
		category string
		region   string
	}
	groups := make(map[key]*categoryDigest)
	var order []key

	for _, d := range drops {
		matched := make(map[uuid.UUID]bool)
		for _, w := range watches {
			if w.Category != d.Bucket {
				continue
			}
			if w.Region != nil && *w.Region != d.Region {
				continue
			}
			matched[w.UserID] = true
		}
		for user := range matched {
			k := key{user: user, category: d.Bucket, region: d.Region}
			g, ok := groups[k]
			if !ok {
				g = &categoryDigest{UserID: user, Category: d.Bucket, Region: d.Region}
				groups[k] = g
				order = append(order, k)
			}
			g.Titles = append(g.Titles, d.Title)
		}
	}

	sort.Slice(order, func(i, j int) bool {
		a, b := order[i], order[j]
		if a.user != b.user {
			return a.user.String() < b.user.String()
		}
		if a.category != b.category {
			return a.category < b.category
		}
		return a.region < b.region
	})

	digests := make([]categoryDigest, 0, len(order))
	for _, k := range order {
		digests = append(digests, *groups[k])
	}
	return digests
}

// digestTitle renders "3 new Tops in US". The bucket labels are already
// plural, so no singular form is attempted for a count of one.
func digestTitle(count int, category, region string) string {
	label := bucketLabels[category]
	if label == "" {
		label = category
	}
	return fmt.Sprintf("%d new %s in %s", count, label, upper(region))
}

// digestBody lists up to three titles, then folds the rest into "and N more".
func digestBody(titles []string) string {
	const shown = 3
	if len(titles) <= shown {
		return strings.Join(titles, ", ")
	}
	return fmt.Sprintf("%s and %d more", strings.Join(titles[:shown], ", "), len(titles)-shown)
}
