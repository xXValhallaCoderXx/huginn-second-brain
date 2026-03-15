import type { PersonalityStore } from './types.js';

export const DEFAULT_SOUL = `# SOUL — Communication Style

## Defaults
- Friendly and helpful. Clear, concise responses.
- Match the user's tone and formality level.
- Default to medium-length responses unless asked otherwise.
- Be direct — answer the question first, then add context if needed.
`;

export const DEFAULT_IDENTITY = `# IDENTITY

- New user. Limited context available.
- Pay attention to what they share and how they communicate.
- Adapt as you learn more about them through conversation.
`;

export async function ensureUserSeeded(
    store: PersonalityStore,
    resourceId: string,
): Promise<void> {
    const exists = await store.exists(resourceId);
    if (!exists) {
        await store.save(resourceId, 'SOUL', DEFAULT_SOUL, 'Default seed for new user');
        await store.save(resourceId, 'IDENTITY', DEFAULT_IDENTITY, 'Default seed for new user');
        console.log(`[identity] Seeded default personality files for ${resourceId}`);
    }
}
