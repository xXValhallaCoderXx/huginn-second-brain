import type { PersonalityStore, CalendarService } from "@huginn/shared";
import {
    getCachedEvents,
    setCachedEvents,
} from "../calendar-cache.js";

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
- Keep it concise — this is a scratchpad, not a journal.

## Calendar
- Your calendar context (if present above) shows today's events the user
  has connected. Reference it naturally when relevant.
- ONLY use the get-calendar tool when the user explicitly asks about their
  schedule, meetings, or availability for specific dates. Never call it
  during normal conversation.

## Knowledge Capture
You have a persistent knowledge base for each user. Use the save-note,
recall-notes, and delete-note tools to manage it.

### Explicit capture
When the user says "remember this", "save this", "note this down", or
similar — save a note immediately using save-note with isExplicit: true.
Confirm briefly: "Saved." Don't over-explain.

### Proactive capture
When a conversation contains a decision, preference, important fact, or
reusable reference that the user would likely want to recall later —
save it proactively with isExplicit: false. Keep the title concise and
the content factual. Mention it briefly: "I noted that down."

### Guardrails
- Never save transient chit-chat, greetings, or trivial small talk.
- Never save sensitive data (passwords, tokens, secrets) as notes.
- When in doubt, don't save — false negatives are better than noise.
- Use tags to categorise notes (e.g. ["decision", "api"], ["preference"]).
- Before saving, quickly recall-notes to avoid duplicates on the same topic.
  If a duplicate exists, update it or skip.

### Recall
When the user asks "what do I know about…", "did I save anything on…",
or references a past decision — use recall-notes to search. Summarise
the results naturally in conversation.`;

export const WORKING_MEMORY_TEMPLATE = `# Active Context

- Current focus/priority:
- Key deadlines:
- Active threads (waiting on X from Y):
- Temporary context (travel, PTO, etc.):
- Recent decisions and rationale:`;

export async function buildInstructions(
  accountId: string,
  store: PersonalityStore,
  calendarService?: CalendarService,
): Promise<string> {
  const [soul, identity] = await Promise.all([
    store.load(accountId, "SOUL"),
    store.load(accountId, "IDENTITY"),
  ]);

  // const hasPersonality = soul !== null || identity !== null;
  console.log(`[buildInstructions] accountId=${accountId} hasSOUL=${soul !== null} hasIDENTITY=${identity !== null}`);

  let calendarBlock = "";
  if (calendarService) {
    try {
      let events = getCachedEvents(accountId);
      if (!events) {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1_000);
        events = await calendarService.getEvents(accountId, {
          start: startOfDay,
          end: endOfDay,
        });
        setCachedEvents(accountId, events);
      }
      calendarBlock = calendarService.formatForContext(events);
    } catch (err) {
      console.warn("[buildInstructions] Calendar fetch failed:", err);
    }
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const dateContext = `Today is ${dateStr}.`;

  return [soul, identity, calendarBlock, dateContext, BASE_INSTRUCTIONS]
    .filter(Boolean)
    .join("\n\n---\n\n");
}
