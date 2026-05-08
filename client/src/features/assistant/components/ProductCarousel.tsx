import type { ProductCard } from "../api/conversationApi";
import { ProductCard as ProductCardComponent } from "./ProductCard";
import styles from "@shared/styles/assistant/product-carousel.module.css";

type ProductCarouselProps = {
  products: ProductCard[];
};

export function ProductCarousel({ products }: ProductCarouselProps) {
  if (!products || products.length === 0) {
    return null;
  }

  return (
    <div className={styles.carouselContainer}>
      <div className={styles.carousel}>
        {products.map((product) => (
          <div key={product.id} className={styles.carouselItem}>
            <ProductCardComponent product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}