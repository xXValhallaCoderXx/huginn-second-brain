export type PersonalityFileType = "SOUL" | "IDENTITY";

export interface VersionEntry {
    version: number;
    content: string;
    reason: string | null;
    createdAt: string;
}

export interface PersonalityStore {
    load(accountId: string, file: PersonalityFileType): Promise<string | null>;
    save(accountId: string, file: PersonalityFileType, content: string, reason: string): Promise<void>;
    exists(accountId: string): Promise<boolean>;
    history(accountId: string, file: PersonalityFileType, limit?: number): Promise<VersionEntry[]>;
}
