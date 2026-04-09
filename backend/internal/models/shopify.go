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
	Variants    []ShopifyVariant `json:"variants"`
	Images      []ShopifyImage   `json:"images"`
}

// ShopifyVariant represents a product variant
type ShopifyVariant struct {
	ID                int64   `json:"id"`
	Title             string  `json:"title"`
	Price             string  `json:"price"`
	CompareAtPrice    *string `json:"compare_at_price"`
	Available         bool    `json:"available"`
	InventoryQuantity int     `json:"inventory_quantity"`
	Option1           string  `json:"option1"`
	Option2           string  `json:"option2"`
	Option3           string  `json:"option3"`
}

// ShopifyImage represents a product image
type ShopifyImage struct {
	ID       int64  `json:"id"`
	Src      string `json:"src"`
	Position int    `json:"position"`
}
