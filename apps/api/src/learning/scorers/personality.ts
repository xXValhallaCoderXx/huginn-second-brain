/**
 * Personality scorer — evaluates candidate SOUL/IDENTITY files against
 * user observations using Mastra's createScorer() four-step pipeline.
 *
 * Pipeline: preprocess (hard gates) → analyze (LLM judge) → generateScore → generateReason
 *
 * Dimensions (weighted composite):
 *   - Evidence grounding  (0.30) — claims backed by observations
 *   - Specificity         (0.20) — actionable, not platitudes
 *   - No regression       (0.25) — preserves existing accurate content
 *   - Factual accuracy    (0.25) — nothing fabricated
 *
 * Hard gates (auto-fail → score 0):
 *   - Combined text exceeds token budget
 *   - Either file is empty / trivially short
 */

import { createScorer } from '@mastra/core/evals';
import { z } from 'zod';
import { SCORER_MODEL, TOKEN_BUDGET, log } from '../config.js';

const MIN_LENGTH = 20;

const WEIGHTS = {
  evidenceGrounding: 0.30,
  specificity: 0.20,
  noRegression: 0.25,
  factualAccuracy: 0.25,
} as const;

const dimensionSchema = z.object({
  evidenceGrounding: z.number().min(0).max(1),
  specificity: z.number().min(0).max(1),
  noRegression: z.number().min(0).max(1),
  factualAccuracy: z.number().min(0).max(1),
  weakestDimension: z.string(),
});

/**
 * Usage:
 *   const result = await personalityScorer.run({
 *     output: { candidateSoul, candidateIdentity, currentSoul, currentIdentity, observations },
 *   });
 *   result.score              // 0.0–1.0 composite
 *   result.reason             // human-readable critique for redraft
 *   result.analyzeStepResult  // per-dimension breakdown
 */
export const personalityScorer = createScorer({
  id: 'personality-fit',
  description:
    'Evaluates candidate SOUL/IDENTITY personality files against user conversation observations',
  judge: {
    model: SCORER_MODEL,
    instructions:
      'You evaluate AI personality profile updates for quality. Score each dimension honestly — a low score with a clear reason is more useful than an inflated score.',
  },
})
  // Step 1 — Hard gates (deterministic, no LLM)
  .preprocess(({ run }) => {
    const { candidateSoul, candidateIdentity } = run.output;
    const combined = `${candidateSoul}\n${candidateIdentity}`;
    const tokenEstimate = Math.ceil(combined.length / 4);

    const tooLong = tokenEstimate > TOKEN_BUDGET * 2; // budget is per-file; combined limit is 2x
    const soulEmpty = candidateSoul.length < MIN_LENGTH;
    const identityEmpty = candidateIdentity.length < MIN_LENGTH;
    const hardGateFailed = tooLong || soulEmpty || identityEmpty;

    let failReason: string | undefined;
    if (tooLong) failReason = `Token estimate ${tokenEstimate} exceeds combined budget ${TOKEN_BUDGET * 2}`;
    else if (soulEmpty) failReason = `SOUL is under ${MIN_LENGTH} characters`;
    else if (identityEmpty) failReason = `IDENTITY is under ${MIN_LENGTH} characters`;

    if (hardGateFailed) log(`hard gate failed: ${failReason}`);

    return { hardGateFailed, tokenEstimate, failReason };
  })

  // Step 2 — LLM-as-judge evaluates all 4 dimensions at once
  .analyze({
    description: 'Evaluate personality update across all quality dimensions',
    outputSchema: dimensionSchema,
    createPrompt: ({ run, results }) => {
      if (results.preprocessStepResult?.hardGateFailed) {
        return `Return all scores as 0 and weakestDimension as "hardGate: ${results.preprocessStepResult.failReason}".

Return JSON: {"evidenceGrounding":0,"specificity":0,"noRegression":0,"factualAccuracy":0,"weakestDimension":"hardGate"}`;
      }

      const {
        candidateSoul, candidateIdentity,
        currentSoul, currentIdentity,
        observations,
      } = run.output;

      return `Evaluate this personality profile update on four dimensions (0.0–1.0 each).

CURRENT SOUL:
${currentSoul}

CURRENT IDENTITY:
${currentIdentity}

PROPOSED SOUL:
${candidateSoul}

PROPOSED IDENTITY:
${candidateIdentity}

OBSERVATIONS (evidence from user conversations):
${observations}

Score each dimension:
1. evidenceGrounding: Can every NEW claim in the proposed files be traced to an observation? (1.0 = all grounded, 0.0 = all fabricated). Existing claims carried forward from current files don't need new evidence.
2. specificity: Are traits specific and observable — names, tools, preferences, patterns — or vague platitudes like "enjoys technology"? (1.0 = highly specific)
3. noRegression: Is all accurate content from current files preserved in the proposed files? (1.0 = nothing lost, 0.0 = major content dropped)
4. factualAccuracy: Is anything stated that contradicts the observations or invents facts not supported by them? (1.0 = nothing fabricated)
5. weakestDimension: Name of the lowest-scoring dimension with a brief explanation of why it scored low.

Return JSON matching the schema exactly.`;
    },
  })

  // Step 3 — Weighted composite score (deterministic)
  .generateScore(({ results }) => {
    if (results.preprocessStepResult?.hardGateFailed) return 0;

    const d = results.analyzeStepResult;
    const score =
      WEIGHTS.evidenceGrounding * d.evidenceGrounding +
      WEIGHTS.specificity * d.specificity +
      WEIGHTS.noRegression * d.noRegression +
      WEIGHTS.factualAccuracy * d.factualAccuracy;

    log(`scored: evidence=${d.evidenceGrounding}, specificity=${d.specificity}, noRegression=${d.noRegression}, accuracy=${d.factualAccuracy}, composite=${score.toFixed(2)}`);

    return score;
  })

  // Step 4 — Human-readable critique (used as feedback for redraft loop)
  .generateReason({
    description: 'Generate critique for the redraft loop',
    createPrompt: ({ results, score }) => {
      if (results.preprocessStepResult?.hardGateFailed) {
        return `The candidate failed a hard gate: ${results.preprocessStepResult.failReason}. Write a one-sentence explanation.`;
      }

      const d = results.analyzeStepResult;
      return `A personality profile update was scored.

Composite score: ${score?.toFixed(2)}
Dimensions:
- Evidence grounding: ${d.evidenceGrounding}
- Specificity: ${d.specificity}
- No regression: ${d.noRegression}
- Factual accuracy: ${d.factualAccuracy}
Weakest dimension: ${d.weakestDimension}

Write a concise one-sentence critique suitable as feedback for a redraft attempt. Focus on the weakest dimension and what specifically should be improved.`;
    },
  });
