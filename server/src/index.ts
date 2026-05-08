import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";

runMigrations();

const app = createApp();

app.listen(config.port, () => {
  console.log(`🚀 AI Commerce Copilot API listening on http://localhost:${config.port}`);
  console.log(`📱 Client origin: ${config.clientOrigin}`);
  
  if (!config.openai.apiKey) {
    console.log("⚠️  OpenAI features disabled (no API key)");
  }
});
