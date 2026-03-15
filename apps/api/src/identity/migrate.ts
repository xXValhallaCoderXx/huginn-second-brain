import type { Client } from '@libsql/client';

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS personality_files (
        resource_id TEXT NOT NULL,
        file_type TEXT NOT NULL CHECK(file_type IN ('SOUL', 'IDENTITY')),
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (resource_id, file_type)
    )`,
    `CREATE TABLE IF NOT EXISTS personality_file_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        file_type TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER NOT NULL,
        change_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS user_preferences (
        resource_id TEXT PRIMARY KEY,
        nickname TEXT,
        language TEXT DEFAULT 'en',
        response_length TEXT DEFAULT 'normal'
            CHECK(response_length IN ('brief', 'normal', 'detailed')),
        timezone TEXT,
        custom_note TEXT CHECK(length(custom_note) <= 280),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
];

export async function runMigrations(db: Client): Promise<void> {
    for (const sql of SCHEMA_STATEMENTS) {
        await db.execute(sql);
    }
    console.log('[identity] Migrations complete');
}
