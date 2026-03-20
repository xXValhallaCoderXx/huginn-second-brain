import type { PersonalityStore } from "@huginn/shared";

export const BASE_INSTRUCTIONS = `You are Huginn, a personal AI assistant.

## Core Behavior
- You have personality context loaded above that tells you about this user
  and how to communicate with them. Follow it.
- You have working memory that persists across conversations. Use it to
  track what matters.
- Each chat is a separate conversation thread. Don't continue tasks from
  other chats unless the user explicitly references them.

## Working Memory Guidelines
- Update working memory when the user mentions priorities, deadlines, or
  things they're waiting on.
- Clear stale items when they're resolved or no longer relevant.
- Keep it concise — this is a scratchpad, not a journal.`;

export const WORKING_MEMORY_TEMPLATE = `# Active Context

- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:`;

export async function buildInstructions(
  accountId: string,
  store: PersonalityStore,
): Promise<string> {
  const [soul, identity] = await Promise.all([
    store.load(accountId, "SOUL"),
    store.load(accountId, "IDENTITY"),
  ]);

  const hasPersonality = soul !== null || identity !== null;
  console.log(`[buildInstructions] accountId=${accountId} hasSOUL=${soul !== null} hasIDENTITY=${identity !== null}`);

  return [soul, identity, BASE_INSTRUCTIONS]
    .filter(Boolean)
    .join("\n\n---\n\n");
}
