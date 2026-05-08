import { Router } from "express";
import { ServiceContainer } from "../services/serviceContainer.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// GET /api/products/search - Search products (for testing ProductSearchService)
// NOTE: This route must come before /:id to avoid matching "search" as an ID
router.get("/search", asyncHandler(async (req, res) => {
  const { q: query, category, minPrice, maxPrice, sortBy, limit } = req.query;

  const searchParams = {
    query: typeof query === "string" ? query : undefined,
    category: typeof category === "string" ? category : undefined,
    minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
    maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
    sortBy: typeof sortBy === "string" && 
            ["price_asc", "price_desc", "rating_desc"].includes(sortBy) 
            ? sortBy as any : undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
  };

  const productSearchService = ServiceContainer.getProductSearchService();
  const result = await productSearchService.searchProducts(searchParams);
  res.json(result);
}));

// GET /api/products/:id - Get individual product details
router.get("/:id", asyncHandler(async (req, res) => {
  const productId = parseInt(req.params.id as string, 10);
  
  if (!productId || isNaN(productId)) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }

  const productSearchService = ServiceContainer.getProductSearchService();
  const product = await productSearchService.getProductById(productId);
  
  res.json({ product });
}));

export default router;