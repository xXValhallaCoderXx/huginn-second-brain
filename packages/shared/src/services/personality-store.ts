import { eq, and, desc, sql } from "drizzle-orm";
import type { Database } from "../db";
import { personalityFiles } from "../schema/personality-files";
import type { PersonalityStore, VersionEntry } from "../types/identity";

export function createPersonalityStore(db: Database): PersonalityStore {
    return {
        async load(accountId, file) {
            const row = await db.query.personalityFiles.findFirst({
                where: and(
                    eq(personalityFiles.accountId, accountId),
                    eq(personalityFiles.fileType, file),
                ),
                orderBy: desc(personalityFiles.version),
            });
            return row ? row.content : null;
        },

        async save(accountId, file, content, reason) {
            // Get current max version for this (accountId, fileType) pair
            const [current] = await db
                .select({ maxVersion: sql<number>`coalesce(max(${personalityFiles.version}), 0)` })
                .from(personalityFiles)
                .where(
                    and(
                        eq(personalityFiles.accountId, accountId),
                        eq(personalityFiles.fileType, file),
                    ),
                );

            const nextVersion = (current?.maxVersion ?? 0) + 1;

            await db.insert(personalityFiles).values({
                accountId,
                fileType: file,
                content,
                version: nextVersion,
                reason,
            });
        },

        async exists(accountId) {
            const row = await db.query.personalityFiles.findFirst({
                where: eq(personalityFiles.accountId, accountId),
                columns: { id: true },
            });
            return row !== undefined;
        },

        async history(accountId, file, limit = 10) {
            const rows = await db
                .select({
                    version: personalityFiles.version,
                    content: personalityFiles.content,
                    reason: personalityFiles.reason,
                    createdAt: personalityFiles.createdAt,
                })
                .from(personalityFiles)
                .where(
                    and(
                        eq(personalityFiles.accountId, accountId),
                        eq(personalityFiles.fileType, file),
                    ),
                )
                .orderBy(desc(personalityFiles.version))
                .limit(limit);

            return rows.map((r): VersionEntry => ({
                version: r.version,
                content: r.content,
                reason: r.reason,
                createdAt: r.createdAt.toISOString(),
            }));
        },
    };
}
