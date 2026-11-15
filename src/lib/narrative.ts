import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  getOpenAIKey,
  getOpenAIModel,
  MIN_SAMPLE_FOR_HYPOTHESIS,
} from "./config";
import type { EvidenceItem, InsightsResult, NarrativeResult } from "./domain";

export const narrativeSchema = z.object({
  summary: z.string(),
  hypothesis: z.string(),
  confidence: z.number().min(0).max(1),
  confidence_basis: z.string(),
  evidence_ids: z.array(z.string()),
  insufficient_evidence: z.boolean(),
});

export type NarrativeModelOutput = z.infer<typeof narrativeSchema>;

export function validateEvidenceIds(
  evidenceIds: string[],
  evidence: EvidenceItem[],
): { ok: true } | { ok: false; invalid: string[] } {
  const allowed = new Set(evidence.map((e) => e.id));
  const invalid = evidenceIds.filter((id) => !allowed.has(id));
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true };
}

export function heuristicConfidence(insights: InsightsResult): {
  confidence: number;
  basis: string;
  insufficient: boolean;
} {
  const n = insights.current.sampleSizeMerged;
  if (n < MIN_SAMPLE_FOR_HYPOTHESIS) {
    return {
      confidence: 0.2,
      basis: `Sample size n=${n} is below the minimum of ${MIN_SAMPLE_FOR_HYPOTHESIS} merged PRs for a causal hypothesis.`,
      insufficient: true,
    };
  }

  const merged = insights.evidence.find((e) => e.metric === "merged_pr_count");
  const tfr = insights.evidence.find(
    (e) => e.metric === "median_time_to_first_review_hours",
  );

  let score = 0.45;
  const notes: string[] = [`n=${n} merged PRs`];

  if (
    merged &&
    merged.current !== null &&
    merged.previous !== null &&
    merged.previous > 0
  ) {
    const drop = (merged.previous - merged.current) / merged.previous;
    if (drop >= 0.2) {
      score += 0.15;
      notes.push("merged volume declined ≥20% vs prior window");
    }
  }

  if (
    tfr &&
    tfr.current !== null &&
    tfr.previous !== null &&
    tfr.previous > 0 &&
    tfr.current > tfr.previous * 1.25
  ) {
    score += 0.15;
    notes.push("median time-to-first-review rose ≥25%");
  }

  if (insights.current.sampleSizeReviewed >= MIN_SAMPLE_FOR_HYPOTHESIS) {
    score += 0.05;
    notes.push("review-latency sample also meets minimum n");
  }

  return {
    confidence: Math.min(0.85, Math.round(score * 100) / 100),
    basis: `Hypothesis confidence (not count confidence). ${notes.join("; ")}.`,
    insufficient: false,
  };
}

export function buildFixtureNarrative(insights: InsightsResult): NarrativeResult {
  const { confidence, basis, insufficient } = heuristicConfidence(insights);
  const merged = insights.evidence.find((e) => e.id === "ev-merged-pr-count")!;
  const tfr = insights.evidence.find((e) => e.id === "ev-median-tfr")!;
  const ttm = insights.evidence.find((e) => e.id === "ev-median-ttm")!;

  if (insufficient) {
    return {
      summary: `Only ${insights.current.mergedPrCount} merged human PRs in the window — too few for a reliable bottleneck hypothesis.`,
      hypothesis:
        "Insufficient evidence to attribute delivery changes to review, authoring, or merge latency.",
      confidence,
      confidenceBasis: basis,
      evidenceIds: [merged.id],
      insufficientEvidence: true,
      mode: "fixture",
    };
  }

  const mergedDelta =
    merged.previous && merged.previous > 0
      ? Math.round(
          ((merged.current! - merged.previous) / merged.previous) * 100,
        )
      : null;

  const summaryParts = [
    `Merged PR volume moved from ${merged.previous} to ${merged.current}` +
      (mergedDelta !== null ? ` (${mergedDelta > 0 ? "+" : ""}${mergedDelta}%)` : "") +
      ".",
    tfr.current !== null && tfr.previous !== null
      ? `Median time to first review moved from ${tfr.previous}h to ${tfr.current}h.`
      : null,
    ttm.current !== null && ttm.previous !== null
      ? `Median time to merge moved from ${ttm.previous}h to ${ttm.current}h.`
      : null,
  ].filter(Boolean);

  const reviewWorsened =
    tfr.current !== null &&
    tfr.previous !== null &&
    tfr.current > tfr.previous * 1.2;

  const hypothesis = reviewWorsened
    ? "Longer waits for first review may be contributing to slower delivery; the review stage is the more plausible bottleneck than merge itself."
    : "Delivery changed, but review-latency evidence is mixed; treat any bottleneck attribution as tentative.";

  return {
    summary: summaryParts.join(" "),
    hypothesis,
    confidence,
    confidenceBasis: basis,
    evidenceIds: [merged.id, tfr.id, ttm.id],
    insufficientEvidence: false,
    mode: "fixture",
  };
}

function evidencePackForPrompt(insights: InsightsResult) {
  return {
    repo: `${insights.repo.owner}/${insights.repo.repo}`,
    window: insights.window,
    prior_window: insights.priorWindow,
    evidence: insights.evidence.map((e) => ({
      id: e.id,
      metric: e.metric,
      label: e.label,
      definition: e.definition,
      current: e.current,
      previous: e.previous,
      n: e.n,
      previous_n: e.previousN,
      unit: e.unit,
    })),
    rules: [
      "Treat evidence values as facts. Do not invent numbers.",
      "Hypothesis must be causal speculation only, not a proven root cause.",
      "Only reference evidence_ids from the provided list.",
      "If sample sizes are small, set insufficient_evidence=true and lower confidence.",
      "confidence is confidence in the hypothesis, not in the metric calculations.",
    ],
  };
}

export async function generateNarrative(
  insights: InsightsResult,
): Promise<NarrativeResult> {
  const apiKey = getOpenAIKey();
  if (!apiKey || insights.mode === "fixture") {
    return buildFixtureNarrative(insights);
  }

  const client = new OpenAI({ apiKey });
  const pack = evidencePackForPrompt(insights);
  const heuristic = heuristicConfidence(insights);

  const completion = await client.chat.completions.parse({
    model: getOpenAIModel(),
    messages: [
      {
        role: "system",
        content:
          "You are an engineering analytics assistant. You synthesize collaboration metrics into a short factual summary and a cautious root-cause hypothesis. Never invent metrics. Cite only provided evidence IDs.",
      },
      {
        role: "user",
        content: JSON.stringify(pack),
      },
    ],
    response_format: zodResponseFormat(narrativeSchema, "insight_narrative"),
  });

  const parsed = completion.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("LLM returned no structured narrative");
  }

  const check = validateEvidenceIds(parsed.evidence_ids, insights.evidence);
  if (!check.ok) {
    throw new Error(
      `LLM cited unknown evidence ids: ${check.invalid.join(", ")}`,
    );
  }

  // Prefer server-side heuristic confidence so the number has documented semantics.
  return {
    summary: parsed.summary,
    hypothesis: parsed.hypothesis,
    confidence: heuristic.confidence,
    confidenceBasis: `${heuristic.basis} Model also said: ${parsed.confidence_basis}`,
    evidenceIds: parsed.evidence_ids,
    insufficientEvidence:
      parsed.insufficient_evidence || heuristic.insufficient,
    mode: "live",
  };
}
