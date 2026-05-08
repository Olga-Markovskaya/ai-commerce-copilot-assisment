import type { ProductCard } from "../api/conversationApi";
import { ProductCarousel } from "./ProductCarousel";
import { RecommendationSummary } from "./RecommendationSummary";
import styles from "@shared/styles/assistant/product-recommendation.module.css";

type ProductRecommendationBlockProps = {
  title: string;
  products: ProductCard[];
  summary?: string;
};

export function ProductRecommendationBlock({ 
  title, 
  products, 
  summary 
}: ProductRecommendationBlockProps) {
  return (
    <div className={styles.recommendationBlock}>
      <div className={styles.assistantTitle}>
        <span className={styles.assistantLabel}>Assistant</span>
        <h3 className={styles.recommendationTitle}>{title}</h3>
      </div>
      
      <ProductCarousel products={products} />
      
      {summary && (
        <RecommendationSummary content={summary} />
      )}
    </div>
  );
}