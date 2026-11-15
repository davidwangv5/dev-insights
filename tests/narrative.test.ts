import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, loadPullRequests, loadReviews, useMemoryDb } from "@/lib/db";
import { seedFixtureRepo } from "@/lib/fixtures";
import { computeInsights } from "@/lib/metrics";
import {
  buildFixtureNarrative,
  validateEvidenceIds,
} from "@/lib/narrative";

describe("narrative evidence grounding", () => {
  beforeEach(() => {
    closeDb();
    useMemoryDb();
    seedFixtureRepo("acme", "widget");
  });

  it("fixture narrative only cites known evidence ids", () => {
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      loadPullRequests("acme", "widget"),
      loadReviews("acme", "widget"),
      "fixture",
    );
    const narrative = buildFixtureNarrative(insights);
    const check = validateEvidenceIds(narrative.evidenceIds, insights.evidence);
    expect(check).toEqual({ ok: true });
    expect(narrative.insufficientEvidence).toBe(false);
    expect(narrative.confidence).toBeGreaterThan(0.4);
  });

  it("rejects hallucinated evidence ids", () => {
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      loadPullRequests("acme", "widget"),
      loadReviews("acme", "widget"),
      "fixture",
    );
    const check = validateEvidenceIds(
      ["ev-merged-pr-count", "ev-made-up"],
      insights.evidence,
    );
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.invalid).toEqual(["ev-made-up"]);
  });

  it("marks tiny samples as insufficient evidence", () => {
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-04", to: "2026-10-06" },
      loadPullRequests("acme", "widget"),
      loadReviews("acme", "widget"),
      "fixture",
    );
    expect(insights.current.mergedPrCount).toBeLessThan(5);
    const narrative = buildFixtureNarrative(insights);
    expect(narrative.insufficientEvidence).toBe(true);
    expect(narrative.confidence).toBeLessThanOrEqual(0.25);
  });
});
