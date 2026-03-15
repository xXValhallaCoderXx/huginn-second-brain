import type { Client } from '@libsql/client';

let _db: Client | null = null;
let _storageDb: Client | null = null;

export function initLearningDb(db: Client): void {
    _db = db;
}

export function getLearningDb(): Client {
    if (!_db) {
        throw new Error('[learning] DB not initialized — call initLearningDb() first');
    }
    return _db;
}

/** Mastra storage DB — contains mastra_messages, mastra_threads, etc. */
export function initMastraStorageDb(db: Client): void {
    _storageDb = db;
}

export function getMastraStorageDb(): Client {
    if (!_storageDb) {
        throw new Error('[learning] Mastra storage DB not initialized — call initMastraStorageDb() first');
    }
    return _storageDb;
}
