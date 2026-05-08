import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config, validateConfig } from "./config/env.js";
import chatRoutes from "./routes/chat.routes.js";
import conversationRoutes from "./routes/conversations.routes.js";
import productRoutes from "./routes/products.routes.js";

// Validate configuration
validateConfig();

const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: config.clientOrigin,
  }));
  app.use(helmet());
  app.use(express.json({ limit: "50kb" }));
  app.use(globalRateLimit);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API routes
  app.use("/api/chat", chatRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/products", productRoutes);

  return app;
}