/**
 * Learning engine configuration.
 * POC: hardcoded for personality aspect. Will become per-aspect in Phase 2.
 */

export const DEV_MODE = process.env.LEARNING_DEV_MODE === 'true';

/** Cheap model for triage gate + scorer judge calls */
export const TRIAGE_MODEL = 'openrouter/google/gemini-2.5-flash';

/** Strong model for drafting personality updates */
export const DRAFT_MODEL = 'openrouter/openai/gpt-5-mini';

/** Scorer judge model — cheap but capable of structured analysis */
export const SCORER_MODEL = 'openrouter/google/gemini-2.5-flash';

/** Signals needed before triage gate fires */
export const SIGNAL_THRESHOLD = DEV_MODE ? 3 : 5;

/** Minimum gap between learning runs (ms) */
export const COOLDOWN_MS = DEV_MODE ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;

/** Minimum composite score to commit a personality update */
export const SCORE_THRESHOLD = 0.7;

/** Max draft→score→feedback iterations before aborting */
export const MAX_ITERATIONS = 3;

/** Max tokens per personality file (hard gate) */
export const TOKEN_BUDGET = 1500;

/** How many recent messages to gather when OM is unavailable (cold start) */
export const GATHER_MESSAGE_LIMIT = 40;

export function log(msg: string, ...args: unknown[]) {
    if (DEV_MODE) {
        console.log(`[learning:debug] ${msg}`, ...args);
    } else {
        console.log(`[learning] ${msg}`, ...args);
    }
}
