import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ProductApiService } from "@features/products/api/productApi";
import { QUERY_KEYS } from "@lib/queryKeys";
import styles from "@shared/styles/pages/product-details.module.css";

const MAX_STARS = 5;

export function ProductDetailsPage() {
  const { productId } = useParams<{ productId: string }>();

  const parsedId = productId ? Number(productId) : NaN;
  const isValidId = !isNaN(parsedId) && parsedId > 0;

  // useQuery is called unconditionally (Rules of Hooks).
  // `enabled: isValidId` skips the fetch for invalid IDs; the invalid-ID
  // early return below handles that case in the render output.
  const { data: product, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.product, productId],
    queryFn: () => ProductApiService.getProduct(parsedId),
    enabled: isValidId,
  });

  if (!isValidId) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Unable to load product</h2>
          <p>Invalid product ID</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <p>Loading product details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Unable to load product</h2>
          <p>{error instanceof Error ? error.message : "Failed to load product"}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Product not found</h2>
          <p>The product you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  const discountPrice =
    product.discountPercentage > 0
      ? (product.price * (1 - product.discountPercentage / 100)).toFixed(2)
      : null;

  // Clamp to [0, 5] before rounding so a malformed rating never overflows.
  const filledStars = Math.min(MAX_STARS, Math.max(0, Math.round(product.rating)));
  const emptyStars = MAX_STARS - filledStars;

  return (
    <div className={styles.container}>
      <div className={styles.productDetails}>
        <div className={styles.imageSection}>
          <img
            src={product.thumbnail}
            alt={product.title}
            className={styles.productImage}
            decoding="async"
          />
        </div>

        <div className={styles.infoSection}>
          {product.brand && (
            <div className={styles.brand}>{product.brand}</div>
          )}

          <h1 className={styles.title}>{product.title}</h1>

          <div className={styles.category}>{product.category}</div>

          <div className={styles.priceSection}>
            {discountPrice ? (
              <>
                <span className={styles.discountedPrice}>${discountPrice}</span>
                <span className={styles.originalPrice}>${product.price}</span>
                <span className={styles.savings}>
                  Save {product.discountPercentage}%
                </span>
              </>
            ) : (
              <span className={styles.price}>${product.price}</span>
            )}
          </div>

          <div className={styles.rating}>
            <span
              className={styles.stars}
              aria-label={`${product.rating} out of 5 stars`}
            >
              {"⭐".repeat(filledStars)}
              {"☆".repeat(emptyStars)}
            </span>
            <span className={styles.ratingValue}>{product.rating}/5</span>
          </div>

          <div className={styles.availability}>
            <strong>Availability:</strong> {product.availabilityStatus}
            {product.stock > 0 && (
              <span className={styles.stockInfo}> ({product.stock} in stock)</span>
            )}
          </div>

          <div className={styles.description}>
            <h3>Description</h3>
            <p>{product.description}</p>
          </div>

          <div className={styles.actionSection}>
            <button
              className={styles.addToCartButton}
              disabled={product.stock === 0}
              onClick={() => {
                alert("Add to cart functionality coming soon!");
              }}
            >
              {product.stock > 0 ? "Add to Cart" : "Out of Stock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
