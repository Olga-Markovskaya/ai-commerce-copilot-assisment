import { Link } from "react-router-dom";
import type { ProductCard as ProductCardType } from "../api/conversationApi";
import styles from "@shared/styles/assistant/product-card.module.css";

type ProductCardProps = {
  product: ProductCardType;
};

export function ProductCard({ product }: ProductCardProps) {
  const discountPrice = product.discountPercentage > 0 
    ? (product.price * (1 - product.discountPercentage / 100)).toFixed(2)
    : null;

  return (
    <Link to={`/products/${product.id}`} className={styles.productCard}>
      <div className={styles.imageContainer}>
        <img
          src={product.thumbnail}
          alt={product.title}
          className={styles.thumbnail}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        {product.discountPercentage > 0 && (
          <div className={styles.discountBadge}>
            -{product.discountPercentage}%
          </div>
        )}
      </div>
      
      <div className={styles.content}>
        <h4 className={styles.title}>{product.title}</h4>
        <p className={styles.description}>{product.description}</p>
        
        <div className={styles.priceSection}>
          {discountPrice ? (
            <>
              <span className={styles.discountedPrice}>${discountPrice}</span>
              <span className={styles.originalPrice}>${product.price}</span>
            </>
          ) : (
            <span className={styles.price}>${product.price}</span>
          )}
        </div>
        
        <div className={styles.metadata}>
          <div className={styles.rating}>
            ⭐ {product.rating}
          </div>
          {product.stock > 0 ? (
            <div className={styles.stock}>In stock</div>
          ) : (
            <div className={styles.outOfStock}>Out of stock</div>
          )}
        </div>
        
        {product.brand && (
          <div className={styles.brand}>{product.brand}</div>
        )}
      </div>
    </Link>
  );
}