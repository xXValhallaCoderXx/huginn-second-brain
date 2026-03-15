/**
 * Learning Loop — the core of the POC.
 *
 * Gathers context (raw messages for now), drafts updated SOUL + IDENTITY,
 * scores the candidate, provides feedback if it fails, and loops up to
 * MAX_ITERATIONS times before committing or aborting.
 */

import type { Client } from '@libsql/client';
import { Agent } from '@mastra/core/agent';
import type { PersonalityStore, PersonalityFileType } from '../identity/types.js';
import { scorePersonalityCandidate, type ScorerResult } from './scorers/personality.js';
import { resetSignals } from './signal.js';
import { DRAFT_MODEL, SCORE_THRESHOLD, MAX_ITERATIONS, GATHER_MESSAGE_LIMIT, log } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearningRunResult {
    outcome: 'COMMITTED' | 'ABORTED' | 'TRIAGE_SKIP';
    iterations: number;
    finalScore: number | null;
    changeSummary: string;
    durationMs: number;
}

interface GatheredContext {
    messages: string[];
    source: 'messages';
}

// ---------------------------------------------------------------------------
// Draft agent — strong model, no memory
// ---------------------------------------------------------------------------

const draftAgent = new Agent({
    id: 'learning-drafter',
    model: DRAFT_MODEL,
    instructions: `You are a personality profiler for a personal AI assistant. Your job is to update the assistant's personality files based on conversation evidence.

Rules:
- Every claim MUST be grounded in the conversation evidence provided
- Be SPECIFIC — avoid generic platitudes like "friendly and helpful"
- Preserve existing accurate information — only add, refine, or correct
- Keep each file concise (under 1500 tokens)
- Use markdown format with clear headers and bullet points
- Never fabricate information not supported by the conversations`,
});

// ---------------------------------------------------------------------------
// GATHER: collect conversation context
// ---------------------------------------------------------------------------

async function gatherContext(
    db: Client,
    resourceId: string,
    threadId: string,
): Promise<GatheredContext> {
    // POC: read raw messages from Mastra's storage.
    // Phase 2 will add OM observation reading as a primary source.
    const result = await db.execute({
        sql: `SELECT content, role FROM mastra_messages
              WHERE "resourceId" = ? AND "threadId" = ?
              ORDER BY "createdAt" DESC
              LIMIT ?`,
        args: [resourceId, threadId, GATHER_MESSAGE_LIMIT],
    });

    const messages = result.rows
        .map(row => `[${row.role}] ${row.content}`)
        .reverse(); // chronological order

    return { messages, source: 'messages' };
}

/**
 * Gather messages across ALL threads for a resource (user).
 * Used by /learn when we don't have a single thread context.
 */
async function gatherAllThreadContext(
    db: Client,
    resourceId: string,
): Promise<GatheredContext> {
    const result = await db.execute({
        sql: `SELECT content, role, "threadId" FROM mastra_messages
              WHERE "resourceId" = ?
              ORDER BY "createdAt" DESC
              LIMIT ?`,
        args: [resourceId, GATHER_MESSAGE_LIMIT],
    });

    const messages = result.rows
        .map(row => `[${row.role}] ${row.content}`)
        .reverse();

    return { messages, source: 'messages' };
}

// ---------------------------------------------------------------------------
// DRAFT: generate candidate personality files
// ---------------------------------------------------------------------------

function buildDraftPrompt(
    currentSoul: string | null,
    currentIdentity: string | null,
    evidence: string[],
    feedback?: string,
): string {
    const feedbackSection = feedback
        ? `\n## Feedback from previous attempt\n${feedback}\nAddress the issues above in this revision.\n`
        : '';

    return `Based on these conversation messages with the user, update their personality files.
${feedbackSection}
## Current SOUL (communication style)
${currentSoul ?? '(default — no personalized content yet)'}

## Current IDENTITY (who the user is)
${currentIdentity ?? '(default — no personalized content yet)'}

## Conversation Evidence
${evidence.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Instructions
Generate updated versions of BOTH files. Ground every claim in the conversation evidence above.

Respond in EXACTLY this format (including the markers):

===SOUL===
(updated SOUL content in markdown)
===END_SOUL===

===IDENTITY===
(updated IDENTITY content in markdown)
===END_IDENTITY===`;
}

function parseDraftResponse(text: string): { soul: string; identity: string } | null {
    const soulMatch = text.match(/===SOUL===\s*([\s\S]*?)\s*===END_SOUL===/);
    const identityMatch = text.match(/===IDENTITY===\s*([\s\S]*?)\s*===END_IDENTITY===/);

    if (!soulMatch?.[1] || !identityMatch?.[1]) {
        log('failed to parse draft response — missing markers');
        return null;
    }

    return {
        soul: soulMatch[1].trim(),
        identity: identityMatch[1].trim(),
    };
}

// ---------------------------------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------------------------------

export async function runLearningLoop(opts: {
    db: Client;
    store: PersonalityStore;
    resourceId: string;
    threadId?: string;
}): Promise<LearningRunResult> {
    const { db, store, resourceId, threadId } = opts;
    const startTime = Date.now();

    // --- GATHER ---
    const context = threadId
        ? await gatherContext(db, resourceId, threadId)
        : await gatherAllThreadContext(db, resourceId);

    if (context.messages.length < 3) {
        log('not enough messages to learn from');
        return {
            outcome: 'ABORTED',
            iterations: 0,
            finalScore: null,
            changeSummary: 'Not enough conversation history',
            durationMs: Date.now() - startTime,
        };
    }

    const [currentSoul, currentIdentity] = await Promise.all([
        store.load(resourceId, 'SOUL'),
        store.load(resourceId, 'IDENTITY'),
    ]);

    let feedback: string | undefined;
    let lastScore: ScorerResult | null = null;

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        log(`iteration ${iteration}/${MAX_ITERATIONS}`);

        // --- DRAFT ---
        const prompt = buildDraftPrompt(currentSoul, currentIdentity, context.messages, feedback);
        const draftResult = await draftAgent.generate(prompt, {
            modelSettings: { maxOutputTokens: 3000, temperature: 0.3 },
        });

        const parsed = parseDraftResponse(draftResult.text ?? '');
        if (!parsed) {
            feedback = 'Your previous response could not be parsed. Use the exact ===SOUL=== and ===IDENTITY=== markers.';
            continue;
        }

        // --- SCORE both files, take the minimum composite ---
        const [soulScore, identityScore] = await Promise.all([
            scorePersonalityCandidate({
                proposed: parsed.soul,
                current: currentSoul ?? '',
                evidence: context.messages,
            }),
            scorePersonalityCandidate({
                proposed: parsed.identity,
                current: currentIdentity ?? '',
                evidence: context.messages,
            }),
        ]);

        // Use the lower of the two scores as the composite
        lastScore = soulScore.composite <= identityScore.composite ? soulScore : identityScore;
        const minComposite = Math.min(soulScore.composite, identityScore.composite);

        log(`iteration ${iteration}: soul=${soulScore.composite.toFixed(2)}, identity=${identityScore.composite.toFixed(2)}, min=${minComposite.toFixed(2)}`);

        // --- Check hard gates ---
        if (soulScore.hardGateFailed) {
            feedback = `SOUL hard gate failed: ${soulScore.hardGateFailed}. ${soulScore.reason}`;
            continue;
        }
        if (identityScore.hardGateFailed) {
            feedback = `IDENTITY hard gate failed: ${identityScore.hardGateFailed}. ${identityScore.reason}`;
            continue;
        }

        // --- PASS? ---
        if (minComposite >= SCORE_THRESHOLD) {
            // COMMIT
            await Promise.all([
                store.save(resourceId, 'SOUL', parsed.soul, `Learning loop: composite=${minComposite.toFixed(2)}, iterations=${iteration}`),
                store.save(resourceId, 'IDENTITY', parsed.identity, `Learning loop: composite=${minComposite.toFixed(2)}, iterations=${iteration}`),
            ]);

            await resetSignals(db, resourceId, 'personality');

            const result: LearningRunResult = {
                outcome: 'COMMITTED',
                iterations: iteration,
                finalScore: minComposite,
                changeSummary: `Updated SOUL + IDENTITY (score: ${minComposite.toFixed(2)}, ${iteration} iteration(s))`,
                durationMs: Date.now() - startTime,
            };

            await logRefinement(db, resourceId, result);
            log(`committed: ${result.changeSummary}`);
            return result;
        }

        // --- FEEDBACK for next iteration ---
        const issues: string[] = [];
        if (soulScore.composite < SCORE_THRESHOLD) {
            issues.push(`SOUL scored ${soulScore.composite.toFixed(2)}: ${soulScore.reason}`);
        }
        if (identityScore.composite < SCORE_THRESHOLD) {
            issues.push(`IDENTITY scored ${identityScore.composite.toFixed(2)}: ${identityScore.reason}`);
        }
        feedback = issues.join('\n\n');
    }

    // --- MAX ITERATIONS EXHAUSTED: ABORT ---
    await resetSignals(db, resourceId, 'personality');

    const result: LearningRunResult = {
        outcome: 'ABORTED',
        iterations: MAX_ITERATIONS,
        finalScore: lastScore?.composite ?? null,
        changeSummary: `Aborted after ${MAX_ITERATIONS} iterations (best score: ${lastScore?.composite?.toFixed(2) ?? 'N/A'})`,
        durationMs: Date.now() - startTime,
    };

    await logRefinement(db, resourceId, result);
    log(`aborted: ${result.changeSummary}`);
    return result;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

async function logRefinement(
    db: Client,
    resourceId: string,
    result: LearningRunResult,
): Promise<void> {
    await db.execute({
        sql: `INSERT INTO refinement_log
              (resource_id, aspect_id, triage_result, iterations, final_score, outcome, change_summary, duration_ms)
              VALUES (?, 'personality', 'YES', ?, ?, ?, ?, ?)`,
        args: [
            resourceId,
            result.iterations,
            result.finalScore,
            result.outcome,
            result.changeSummary,
            result.durationMs,
        ],
    });
}
