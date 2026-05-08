export const config = {
  port: Number(process.env.PORT) || 4000, // Fixed default port for stable development
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    maxCompletionTokens: Number(process.env.OPENAI_MAX_COMPLETION_TOKENS) || 400,
  },
  dummyJson: {
    baseUrl: process.env.DUMMYJSON_BASE_URL || "https://dummyjson.com",
  },
  database: {
    sqlitePath: process.env.SQLITE_DB_PATH || "./data/app.db",
  },
} as const;

export function validateConfig() {
  if (!config.openai.apiKey) {
    console.warn("⚠️  OPENAI_API_KEY not set — assistant will run in rule-based fallback mode");
  }
}