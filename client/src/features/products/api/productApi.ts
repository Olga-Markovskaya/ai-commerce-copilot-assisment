import { API_BASE_URL } from "@lib/api";
import type { ProductCard } from "@lib/types";

export type GetProductResponse = {
  product: ProductCard;
};

export type ProductApiError = {
  error: string;
};

export class ProductApiService {
  static async getProduct(id: number): Promise<ProductCard> {
    const response = await fetch(`${API_BASE_URL}/api/products/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Product not found");
      }
      
      let errorMessage = "Failed to fetch product details";
      
      try {
        const errorData = (await response.json()) as ProductApiError;
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Ignore JSON parse errors, use default message
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json() as GetProductResponse;
    return data.product;
  }
}