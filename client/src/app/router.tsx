import { Routes, Route } from "react-router-dom";
import { HomePage } from "@pages/HomePage";
import { ProductsPage } from "@pages/ProductsPage";
import { ProductDetailsPage } from "@pages/ProductDetailsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/products" element={<ProductsPage />} />
      <Route path="/products/:productId" element={<ProductDetailsPage />} />
    </Routes>
  );
}
