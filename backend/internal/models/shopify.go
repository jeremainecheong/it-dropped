package models

// ShopifyProductsResponse represents the Shopify products.json response
type ShopifyProductsResponse struct {
	Products []ShopifyProduct `json:"products"`
}

// ShopifyProduct represents a product from Shopify API
type ShopifyProduct struct {
	ID          int64            `json:"id"`
	Title       string           `json:"title"`
	Handle      string           `json:"handle"`
	Vendor      string           `json:"vendor"`
	ProductType string           `json:"product_type"`
	CreatedAt   string           `json:"created_at"`
	UpdatedAt   string           `json:"updated_at"`
	PublishedAt string           `json:"published_at"`
	Tags        []string         `json:"tags"`
	Options     []ShopifyOption  `json:"options"`
	Variants    []ShopifyVariant `json:"variants"`
	Images      []ShopifyImage   `json:"images"`
}

// ShopifyOption names the variant axes, e.g. [{name:"Color"},{name:"Size"}].
// The position of "Size" here decides which optionN field actually holds a
// size — it is NOT always option1.
type ShopifyOption struct {
	Name     string   `json:"name"`
	Position int      `json:"position"`
	Values   []string `json:"values"`
}

// ShopifyVariant represents a product variant
type ShopifyVariant struct {
	ID             int64   `json:"id"`
	Title          string  `json:"title"`
	SKU            string  `json:"sku"`
	Price          string  `json:"price"`
	CompareAtPrice *string `json:"compare_at_price"`
	Available      bool    `json:"available"`
	// InventoryQuantity is an Admin API field; the public products.json never
	// populates it, so it always deserializes to 0. Do not rely on it.
	InventoryQuantity int    `json:"inventory_quantity"`
	Option1           string `json:"option1"`
	Option2           string `json:"option2"`
	Option3           string `json:"option3"`
}

// Option returns the variant's value for a 1-based option position.
func (v ShopifyVariant) Option(position int) string {
	switch position {
	case 1:
		return v.Option1
	case 2:
		return v.Option2
	case 3:
		return v.Option3
	}
	return ""
}

// ShopifyImage represents a product image
type ShopifyImage struct {
	ID       int64  `json:"id"`
	Src      string `json:"src"`
	Position int    `json:"position"`
}
