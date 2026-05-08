import type { Request, Response, NextFunction } from "express";
import { HttpError } from "./httpError.js";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof HttpError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error("Unhandled error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  };
}