import styles from "@shared/styles/assistant/product-recommendation.module.css";

type RecommendationSummaryProps = {
  content: string;
};

export function RecommendationSummary({ content }: RecommendationSummaryProps) {
  return (
    <div className={styles.recommendationSummary}>
      <h4 className={styles.summaryTitle}>My recommendation</h4>
      <p className={styles.summaryContent}>{content}</p>
    </div>
  );
}