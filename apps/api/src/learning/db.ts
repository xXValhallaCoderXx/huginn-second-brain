import type { Client } from '@libsql/client';

let _db: Client | null = null;

export function initLearningDb(db: Client): void {
    _db = db;
}

export function getLearningDb(): Client {
    if (!_db) {
        throw new Error('[learning] DB not initialized — call initLearningDb() first');
    }
    return _db;
}
