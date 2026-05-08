// Raw DummyJSON API response types
export type RawDummyJsonProduct = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  tags: string[];
  brand?: string;
  sku: string;
  weight: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  warrantyInformation: string;
  shippingInformation: string;
  availabilityStatus: string;
  reviews: Array<{
    rating: number;
    comment: string;
    date: string;
    reviewerName: string;
    reviewerEmail: string;
  }>;
  returnPolicy: string;
  minimumOrderQuantity: number;
  meta: {
    createdAt: string;
    updatedAt: string;
    barcode: string;
    qrCode: string;
  };
  images: string[];
  thumbnail: string;
};

export type RawDummyJsonProductsResponse = {
  products: RawDummyJsonProduct[];
  total: number;
  skip: number;
  limit: number;
};

// Normalized product card for UI
export type ProductCard = {
  id: number;
  title: string;
  description: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  availabilityStatus: string;
  category: string;
  brand?: string;
  thumbnail: string;
};

// Lightweight product index for cache
export type ProductIndexItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  tags: string[];
  brand?: string;
  thumbnail: string;
};

// Product search parameters
export type ProductSearchParams = {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "price_asc" | "price_desc" | "rating_desc";
  limit?: number;
};

export type ProductSearchResult = {
  products: ProductCard[];
  total: number;
};