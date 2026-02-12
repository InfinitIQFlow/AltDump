import Database from "better-sqlite3";
import path from "path";
import { app } from "electron";

const dbPath = path.join(app.getPath("userData"), "altdump.db");

export const db = new Database(dbPath);

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    content TEXT,
    raw_path TEXT,
    thumbnail_path TEXT,
    embedding TEXT,
    mime_type TEXT,
    hash TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    metadata TEXT
  );
`);
