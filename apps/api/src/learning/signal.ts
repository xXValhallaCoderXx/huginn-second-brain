import type { Client } from '@libsql/client';
import { SIGNAL_THRESHOLD, COOLDOWN_MS, DEV_MODE, log } from './config.js';

export type SignalType = 'FACT' | 'PREF' | 'STYLE' | 'CORRECT' | 'EXPERTISE';

export interface DetectedSignal {
    type: SignalType;
    snippet: string;
}

/**
 * Regex patterns that detect personality-relevant signals from raw messages.
 * Each pattern maps to a signal type. Deterministic — zero LLM calls.
 */
const SIGNAL_PATTERNS: Array<{ type: SignalType; pattern: RegExp }> = [
    // FACT — user states something about themselves
    { type: 'FACT', pattern: /\b(?:i(?:'m| am)|my name is|i live in|i(?:'m| am) based in|i work (?:at|in|as|for))\b/i },
    { type: 'FACT', pattern: /\b(?:i(?:'m| am) a (?:developer|engineer|designer|manager|student|founder|freelancer))\b/i },
    // PREF — user expresses communication preferences
    { type: 'PREF', pattern: /\b(?:i (?:prefer|like|want|need) (?:you to|it when|more|less|shorter|longer|brief|detailed|concise))\b/i },
    { type: 'PREF', pattern: /\b(?:(?:don't|do not|stop|please don't|quit) (?:use|say|do|add|include|start|end))\b/i },
    { type: 'PREF', pattern: /\b(?:call me|address me|refer to me)\b/i },
    { type: 'PREF', pattern: /\b(?:keep (?:it|things|responses?) (?:short|brief|concise|simple|detailed))\b/i },
    // STYLE — user sends writing samples or asks for text improvement
    { type: 'STYLE', pattern: /\b(?:improve|rewrite|rephrase|edit|polish|proofread)\b.*\b(?:this|text|paragraph|email|message|draft)\b/i },
    { type: 'STYLE', pattern: /\b(?:write (?:like|in the style of|as if))\b/i },
    // CORRECT — user corrects agent behavior
    { type: 'CORRECT', pattern: /\b(?:that(?:'s| is) (?:not right|wrong|incorrect)|no,? (?:i meant|actually|what i meant))\b/i },
    { type: 'CORRECT', pattern: /\b(?:i (?:said|asked|meant|wanted)|you (?:misunderstood|got it wrong|missed))\b/i },
    // EXPERTISE — user demonstrates domain knowledge
    { type: 'EXPERTISE', pattern: /\b(?:in my experience|from (?:my|our) codebase|the way (?:we|i) (?:do|handle|implement))\b/i },
];

/**
 * Detect signals from a raw user message.
 * Returns all matched signals (may be multiple per message).
 */
export function detectSignals(text: string): DetectedSignal[] {
    const signals: DetectedSignal[] = [];
    const seenTypes = new Set<SignalType>();

    for (const { type, pattern } of SIGNAL_PATTERNS) {
        if (seenTypes.has(type)) continue; // one signal per type per message
        if (pattern.test(text)) {
            seenTypes.add(type);
            signals.push({ type, snippet: text.slice(0, 120) });
        }
    }

    return signals;
}

/**
 * Increment signal count for a resource/aspect pair.
 * Returns the new count and whether the threshold + cooldown conditions are met.
 */
export async function recordSignals(
    db: Client,
    resourceId: string,
    aspectId: string,
    signalCount: number,
): Promise<{ totalSignals: number; shouldTriage: boolean }> {
    // Upsert signal count
    await db.execute({
        sql: `INSERT INTO learning_state (resource_id, aspect_id, signal_count)
              VALUES (?, ?, ?)
              ON CONFLICT(resource_id, aspect_id) DO UPDATE SET
                signal_count = signal_count + excluded.signal_count`,
        args: [resourceId, aspectId, signalCount],
    });

    // Read current state
    const result = await db.execute({
        sql: 'SELECT signal_count, last_refinement_at FROM learning_state WHERE resource_id = ? AND aspect_id = ?',
        args: [resourceId, aspectId],
    });

    const row = result.rows[0];
    const totalSignals = row?.signal_count as number;
    const lastRefinement = row?.last_refinement_at as string | null;

    // Check threshold — lower for first-ever run
    const isFirstRun = !lastRefinement;
    const effectiveThreshold = isFirstRun ? Math.ceil(SIGNAL_THRESHOLD / 2) : SIGNAL_THRESHOLD;
    const thresholdMet = totalSignals >= effectiveThreshold;

    // Check cooldown
    const cooldownElapsed = !lastRefinement
        || (Date.now() - new Date(lastRefinement).getTime()) >= COOLDOWN_MS;

    const shouldTriage = thresholdMet && cooldownElapsed;

    if (DEV_MODE && signalCount > 0) {
        log(`signals: ${totalSignals}/${effectiveThreshold}, cooldown: ${cooldownElapsed}, shouldTriage: ${shouldTriage}`);
    }

    return { totalSignals, shouldTriage };
}

/**
 * Reset signal counter after a learning run (successful or not).
 */
export async function resetSignals(
    db: Client,
    resourceId: string,
    aspectId: string,
): Promise<void> {
    await db.execute({
        sql: `UPDATE learning_state
              SET signal_count = 0, last_refinement_at = datetime('now')
              WHERE resource_id = ? AND aspect_id = ?`,
        args: [resourceId, aspectId],
    });
}
