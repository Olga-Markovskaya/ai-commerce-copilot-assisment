/**
 * Shared API configuration.
 *
 * All feature API services import API_BASE_URL from here rather than
 * repeating the environment variable lookup. A single location means
 * the default port and the env variable name are changed in one place.
 *
 * Fixed port 4000 for stable local development — do not auto-change.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
