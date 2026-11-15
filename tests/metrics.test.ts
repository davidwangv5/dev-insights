import { beforeEach, describe, expect, it } from "vitest";
import { useMemoryDb, closeDb } from "@/lib/db";
import { seedFixtureRepo } from "@/lib/fixtures";
import { loadPullRequests, loadReviews } from "@/lib/db";
import { computeInsights, firstHumanReview } from "@/lib/metrics";
import { priorWindow } from "@/lib/validation";

describe("fixture metrics for acme/widget Oct 2026", () => {
  beforeEach(() => {
    closeDb();
    useMemoryDb();
    seedFixtureRepo("acme", "widget");
  });

  it("uses merged_at so PRs created outside the window still count", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      prs,
      reviews,
      "fixture",
    );

    // Hand count: pr-1,2,3,4,8,16 (bot pr-7 excluded) = 6
    expect(insights.current.mergedPrCount).toBe(6);

    // pr-1 created Sep 25, merged Oct 5 — counted via merged_at
    const pr1 = prs.find((p) => p.id === "pr-1")!;
    expect(pr1.createdAt.startsWith("2026-09")).toBe(true);
    expect(pr1.mergedAt?.startsWith("2026-10")).toBe(true);
  });

  it("excludes bot-authored merged PRs from merged_pr_count", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      prs,
      reviews,
      "fixture",
    );
    expect(prs.some((p) => p.id === "pr-7" && p.author.isBot)).toBe(true);
    expect(insights.current.mergedPrCount).toBe(6);
  });

  it("ignores self-reviews when computing time to first review", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const pr2 = prs.find((p) => p.id === "pr-2")!;
    const first = firstHumanReview(pr2, reviews);
    expect(first?.id).toBe("rv-2a");
    expect(first?.reviewer.login).toBe("carol");
  });

  it("computes hand-verified medians for October", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      prs,
      reviews,
      "fixture",
    );

    // TFR hours: 168, 48, 240, 24, 144, 48 → median 96
    expect(insights.current.medianTimeToFirstReviewHours).toBe(96);
    // TTM hours: 246, 177, 360, 48, 192, 120 → median 184.5
    expect(insights.current.medianTimeToMergeHours).toBe(184.5);
  });

  it("builds a prior window of equal length", () => {
    const prior = priorWindow({ from: "2026-10-01", to: "2026-10-31" });
    expect(prior).toEqual({ from: "2026-08-31", to: "2026-09-30" });
  });

  it("shows higher prior merged volume than October (delivery drop signal)", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2026-10-01", to: "2026-10-31" },
      prs,
      reviews,
      "fixture",
    );
    expect(insights.previous.mergedPrCount).toBeGreaterThan(
      insights.current.mergedPrCount,
    );
  });

  it("returns empty metrics for a window with no merges", () => {
    const prs = loadPullRequests("acme", "widget");
    const reviews = loadReviews("acme", "widget");
    const insights = computeInsights(
      { owner: "acme", repo: "widget" },
      { from: "2025-01-01", to: "2025-01-31" },
      prs,
      reviews,
      "fixture",
    );
    expect(insights.current.mergedPrCount).toBe(0);
    expect(insights.current.medianTimeToMergeHours).toBeNull();
  });
});
