import type { Client } from '@libsql/client';
import type { PersonalityStore, PersonalityFileType, VersionEntry } from './types.js';

const cache = new Map<string, { content: string; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;

export class DatabasePersonalityStore implements PersonalityStore {
    constructor(private db: Client) {}

    async load(resourceId: string, file: PersonalityFileType): Promise<string | null> {
        const key = `${resourceId}:${file}`;
        const cached = cache.get(key);

        if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
            return cached.content;
        }

        const result = await this.db.execute({
            sql: 'SELECT content FROM personality_files WHERE resource_id = ? AND file_type = ?',
            args: [resourceId, file],
        });

        if (result.rows.length === 0) return null;

        const content = result.rows[0].content as string;
        cache.set(key, { content, loadedAt: Date.now() });
        return content;
    }

    async save(resourceId: string, file: PersonalityFileType, content: string, reason: string): Promise<void> {
        const current = await this.db.execute({
            sql: 'SELECT version FROM personality_files WHERE resource_id = ? AND file_type = ?',
            args: [resourceId, file],
        });

        const nextVersion = current.rows.length > 0 ? (current.rows[0].version as number) + 1 : 1;

        await this.db.execute({
            sql: `INSERT INTO personality_files (resource_id, file_type, content, version, updated_at)
                  VALUES (?, ?, ?, ?, datetime('now'))
                  ON CONFLICT(resource_id, file_type) DO UPDATE SET
                    content = excluded.content,
                    version = excluded.version,
                    updated_at = excluded.updated_at`,
            args: [resourceId, file, content, nextVersion],
        });

        await this.db.execute({
            sql: `INSERT INTO personality_file_history (resource_id, file_type, content, version, change_reason)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [resourceId, file, content, nextVersion, reason],
        });

        cache.delete(`${resourceId}:${file}`);
    }

    async exists(resourceId: string): Promise<boolean> {
        const result = await this.db.execute({
            sql: 'SELECT 1 FROM personality_files WHERE resource_id = ? LIMIT 1',
            args: [resourceId],
        });
        return result.rows.length > 0;
    }

    async history(resourceId: string, file: PersonalityFileType, limit = 10): Promise<VersionEntry[]> {
        const result = await this.db.execute({
            sql: `SELECT version, content, change_reason, created_at
                  FROM personality_file_history
                  WHERE resource_id = ? AND file_type = ?
                  ORDER BY version DESC
                  LIMIT ?`,
            args: [resourceId, file, limit],
        });

        return result.rows.map(row => ({
            version: row.version as number,
            content: row.content as string,
            reason: row.change_reason as string | null,
            createdAt: row.created_at as string,
        }));
    }
}

let _store: DatabasePersonalityStore | null = null;

export function initPersonalityStore(db: Client): DatabasePersonalityStore {
    _store = new DatabasePersonalityStore(db);
    return _store;
}

export function getPersonalityStore(): DatabasePersonalityStore {
    if (!_store) {
        throw new Error('[identity] PersonalityStore not initialized — call initPersonalityStore() first');
    }
    return _store;
}
