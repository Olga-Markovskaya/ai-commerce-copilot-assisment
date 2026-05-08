import { db } from "./sqlite.js";

export function runMigrations(): void {
  console.log("🚀 Running database migrations...");

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        products_json TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
      ON messages(conversation_id);
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at 
      ON conversations(updated_at DESC);
    `);

    console.log("✅ Database migrations completed successfully");
  } catch (error) {
    console.error("❌ Database migration failed:", error);
    throw error;
  }
}