export type PersonalityFileType = 'SOUL' | 'IDENTITY';

export interface VersionEntry {
    version: number;
    content: string;
    reason: string | null;
    createdAt: string;
}

export interface PersonalityStore {
    load(resourceId: string, file: PersonalityFileType): Promise<string | null>;
    save(resourceId: string, file: PersonalityFileType, content: string, reason: string): Promise<void>;
    exists(resourceId: string): Promise<boolean>;
    history(resourceId: string, file: PersonalityFileType, limit?: number): Promise<VersionEntry[]>;
}
