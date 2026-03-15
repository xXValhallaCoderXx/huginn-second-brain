import type { Client } from '@libsql/client';

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS learning_state (
        resource_id TEXT NOT NULL,
        aspect_id TEXT NOT NULL,
        signal_count INTEGER NOT NULL DEFAULT 0,
        last_refinement_at TEXT,
        last_triage_at TEXT,
        PRIMARY KEY (resource_id, aspect_id)
    )`,
    `CREATE TABLE IF NOT EXISTS refinement_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        aspect_id TEXT NOT NULL,
        triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
        triage_result TEXT NOT NULL,
        triage_reason TEXT,
        iterations INTEGER,
        final_score REAL,
        outcome TEXT NOT NULL,
        change_summary TEXT,
        duration_ms INTEGER
    )`,
];

export async function runLearningMigrations(db: Client): Promise<void> {
    for (const sql of SCHEMA_STATEMENTS) {
        await db.execute(sql);
    }
    console.log('[learning] Migrations complete');
}
