import { Agent } from '@mastra/core/agent';
import { TRIAGE_MODEL, log } from './config.js';

export interface TriageResult {
    decision: 'YES' | 'NO';
    reason: string;
}

/** Lightweight agent for triage — no memory, no tools. */
const triageAgent = new Agent({
    id: 'learning-triage',
    name: 'Learning Triage',
    model: TRIAGE_MODEL,
    instructions: 'You evaluate whether a personal AI assistant should run a personality refinement cycle. Answer with EXACTLY one line: YES: <reason> or NO: <reason>.',
});

/**
 * Triage gate: one cheap LLM call to decide whether accumulated signals
 * contain enough NEW information to justify a full learning loop.
 *
 * Cost: ~$0.001 per call.
 */
export async function runTriageGate(opts: {
    signals: string[];
    currentSoul: string | null;
    currentIdentity: string | null;
}): Promise<TriageResult> {
    const { signals, currentSoul, currentIdentity } = opts;

    const prompt = `Given these recent signals about the user:
${signals.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Current SOUL (communication style):
${currentSoul ?? '(default — no personalized content yet)'}

Current IDENTITY (who the user is):
${currentIdentity ?? '(default — no personalized content yet)'}

Is there anything meaningfully NEW to learn that isn't already captured in the current files?
Consider: new facts about the user, new communication preferences, corrections to current understanding.`;

    const result = await triageAgent.generate(prompt, {
        modelSettings: { maxOutputTokens: 100, temperature: 0 },
    });

    const text = (result.text ?? '').trim();
    const isYes = text.toUpperCase().startsWith('YES');
    const reason = text.replace(/^(?:YES|NO):?\s*/i, '').trim() || text;

    log(`triage: ${isYes ? 'YES' : 'NO'} — ${reason}`);

    return {
        decision: isYes ? 'YES' : 'NO',
        reason,
    };
}
