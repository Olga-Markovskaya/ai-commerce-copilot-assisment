import Database from "better-sqlite3";
import { config } from "../config/env.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, "../../../");
const dbPath = resolve(projectRoot, config.database.sqlitePath);

const dbDir = dirname(dbPath);
try {
  mkdirSync(dbDir, { recursive: true });
} catch {
  // Directory already exists
}

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

console.log(`📦 SQLite database connected: ${dbPath}`);

export { db };