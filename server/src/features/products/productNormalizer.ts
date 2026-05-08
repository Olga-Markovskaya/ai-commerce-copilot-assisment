import type { RawDummyJsonProduct, ProductCard, ProductIndexItem } from "./product.types.js";

export class ProductNormalizer {
  static toProductCard(raw: RawDummyJsonProduct): ProductCard {
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      price: raw.price,
      discountPercentage: raw.discountPercentage,
      rating: raw.rating,
      stock: raw.stock,
      availabilityStatus: raw.availabilityStatus,
      category: raw.category,
      brand: raw.brand,
      thumbnail: raw.thumbnail,
    };
  }


  static toProductCards(rawProducts: RawDummyJsonProduct[]): ProductCard[] {
    return rawProducts.map((raw) => this.toProductCard(raw));
  }

  static toProductIndexItems(rawProducts: RawDummyJsonProduct[]): ProductIndexItem[] {
    return rawProducts.map((raw) => this.toProductIndexItem(raw));
  }

  private static toProductIndexItem(raw: RawDummyJsonProduct): ProductIndexItem {
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      category: raw.category,
      tags: raw.tags || [],
      brand: raw.brand,
      thumbnail: raw.thumbnail,
    };
  }
}