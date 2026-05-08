import type { ProductCard } from "../product.types.js";
import { buildSearchableText } from "./searchableTextBuilder.js";

// Synonym groups for semantic expansion
const SYNONYM_GROUPS = {
  manicure: [
    'nail polish', 'nails', 'manicure', 'nail care', 'nail art',
    'beauty', 'cosmetics', 'nail treatment', 'cuticle', 'lacquer'
  ],
  
  perfume: [
    'perfume', 'fragrance', 'cologne', 'scent', 'eau de parfum',
    'eau de toilette', 'parfum', 'body spray', 'mist', 'beauty'
  ],
  
  gift_women: [
    'gift', 'present', 'women', 'woman', 'wife', 'girlfriend',
    'her', 'lady', 'female', 'mom', 'mother', 'sister'
  ],
  
  office_furniture: [
    'office chair', 'chair', 'ergonomic', 'furniture', 'office',
    'desk chair', 'swivel chair', 'task chair', 'work chair',
    'seating', 'computer chair'
  ],
  
  beauty_cosmetics: [
    'beauty', 'cosmetics', 'makeup', 'skincare', 'personal care',
    'toiletries', 'grooming', 'face', 'skin'
  ]
};

/**
 * Extracts semantic hints from a search query including expanded terms and price constraints.
 */
export function extractSemanticHints(query: string): {
  expandedTerms: string[];
  maxPrice?: number;
} {
  const lowerQuery = query.toLowerCase().trim();
  const expandedTerms: string[] = [];
  
  // Add original query terms
  expandedTerms.push(...lowerQuery.split(/\s+/));
  
  // Find matching synonym groups and expand
  for (const [groupName, synonyms] of Object.entries(SYNONYM_GROUPS)) {
    const hasMatch = synonyms.some(synonym => 
      lowerQuery.includes(synonym.toLowerCase())
    );
    
    if (hasMatch) {
      // Add all synonyms from matching groups
      expandedTerms.push(...synonyms);
    }
  }
  
  // Extract price constraints
  const maxPrice = extractMaxPrice(lowerQuery);
  
  return {
    expandedTerms: [...new Set(expandedTerms)], // Remove duplicates
    maxPrice
  };
}

/**
 * Extracts maximum price from query strings like "under 100", "below 500", "less than 100"
 */
function extractMaxPrice(query: string): number | undefined {
  const pricePatterns = [
    /under\s+(\d+)/,
    /below\s+(\d+)/,
    /less\s+than\s+(\d+)/,
    /max\s+(\d+)/,
    /maximum\s+(\d+)/,
    /\$(\d+)/
  ];
  
  for (const pattern of pricePatterns) {
    const match = query.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return undefined;
}

/**
 * Scores a product for relevance to a search query using weighted semantic matching.
 */
export function scoreProductForQuery(product: ProductCard, query: string): number {
  if (!query?.trim()) {
    return 0;
  }
  
  const searchableText = buildSearchableText(product);
  const lowerQuery = query.toLowerCase();
  const queryTerms = lowerQuery.split(/\s+/).filter(term => term.length > 0);
  
  let score = 0;
  
  // Exact phrase match in title (highest weight)
  if (product.title?.toLowerCase().includes(lowerQuery)) {
    score += 100;
  }
  
  // Exact phrase match anywhere
  if (searchableText.includes(lowerQuery)) {
    score += 50;
  }
  
  // Individual term matching with different weights
  for (const term of queryTerms) {
    if (term.length < 2) continue; // Skip very short terms
    
    // Title matches (high weight)
    if (product.title?.toLowerCase().includes(term)) {
      score += 20;
    }
    
    // Brand matches
    if (product.brand?.toLowerCase().includes(term)) {
      score += 15;
    }
    
    // Category matches
    if (product.category?.toLowerCase().includes(term)) {
      score += 10;
    }
    
    // Description matches
    if (product.description?.toLowerCase().includes(term)) {
      score += 5;
    }
    
    // Note: ProductCard doesn't include tags field
    // Tag matching could be added if tags are included in ProductCard in the future
  }
  
  // Boost for semantic similarity using synonyms
  const semanticHints = extractSemanticHints(lowerQuery);
  for (const expandedTerm of semanticHints.expandedTerms) {
    if (expandedTerm !== lowerQuery && searchableText.includes(expandedTerm.toLowerCase())) {
      score += 3; // Lower weight for synonym matches
    }
  }
  
  // Boost for popular/high-rated products (if rating available)
  if (product.rating && product.rating > 4) {
    score += 2;
  }
  
  return score;
}