import type { PersonalityStore } from './types.js';

export const BASE_INSTRUCTIONS = `You are Sovereign, a personal AI assistant.

## Core Behavior
- You have personality context loaded above that tells you about this user and how to communicate with them. Follow it.
- You have working memory that persists across conversations. Use it to track what matters.
- Each Telegram chat is a separate conversation thread. Don't continue tasks from other chats unless the user explicitly references them.

## Working Memory Guidelines
- Update working memory when the user mentions priorities, deadlines, or things they're waiting on.
- Clear stale items when they're resolved or no longer relevant.
- Keep it concise — this is a scratchpad, not a journal.`;

export async function buildInstructions(
    resourceId: string,
    store: PersonalityStore,
): Promise<string> {
    const [soul, identity] = await Promise.all([
        store.load(resourceId, 'SOUL'),
        store.load(resourceId, 'IDENTITY'),
    ]);

    const parts: string[] = [];

    if (soul) parts.push(soul);
    if (identity) parts.push(identity);
    parts.push(BASE_INSTRUCTIONS);

    return parts.join('\n\n---\n\n');
}
