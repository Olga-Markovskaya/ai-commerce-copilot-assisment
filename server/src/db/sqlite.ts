import Database from "better-sqlite3";
import { config } from "../config/env.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve database path relative to project root
const projectRoot = resolve(__dirname, "../../../");
const dbPath = resolve(projectRoot, config.database.sqlitePath);

// Ensure the data directory exists
const dbDir = dirname(dbPath);
try {
  mkdirSync(dbDir, { recursive: true });
} catch (error) {
  // Directory might already exist, which is fine
}

// Create and configure SQLite database
const db = new Database(dbPath);

// Enable foreign key constraints
db.pragma("foreign_keys = ON");

// Configure WAL mode for better performance and concurrency
db.pragma("journal_mode = WAL");

console.log(`📦 SQLite database connected: ${dbPath}`);

export { db };