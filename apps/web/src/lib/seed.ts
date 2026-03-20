import type { PersonalityStore } from "@huginn/shared";

export const DEFAULT_SOUL = `# SOUL — Communication Style

## Defaults

- Friendly and helpful. Clear, concise responses.
- Match the user's tone and formality level.
- Default to medium-length responses unless asked otherwise.
- Be direct — answer the question first, then add context if needed.`;

export const DEFAULT_IDENTITY = `# IDENTITY

- New user. Limited context available.
- Pay attention to what they share and how they communicate.
- Adapt as you learn more about them through conversation.`;

export async function seedNewAccount(
    store: PersonalityStore,
    accountId: string,
): Promise<void> {
    const alreadySeeded = await store.exists(accountId);
    if (alreadySeeded) return;

    await Promise.all([
        store.save(accountId, "SOUL", DEFAULT_SOUL, "Initial seed"),
        store.save(accountId, "IDENTITY", DEFAULT_IDENTITY, "Initial seed"),
    ]);
}
