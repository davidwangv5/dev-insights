import type {
  DateWindow,
  EvidenceItem,
  InsightsResult,
  PeriodMetrics,
  PullRequest,
  RepoRef,
  Review,
} from "./domain";
import { isInWindow, priorWindow } from "./validation";

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function round1(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 10) / 10;
}

/** First non-author, non-bot review for a PR. */
export function firstHumanReview(
  pr: PullRequest,
  reviews: Review[],
): Review | null {
  const candidates = reviews
    .filter(
      (r) =>
        r.pullRequestId === pr.id &&
        !r.reviewer.isBot &&
        r.reviewer.id !== pr.author.id &&
        r.state !== "PENDING",
    )
    .sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
    );
  return candidates[0] ?? null;
}

export function computePeriodMetrics(
  prs: PullRequest[],
  reviews: Review[],
  window: DateWindow,
): PeriodMetrics {
  const humanPrs = prs.filter((p) => !p.author.isBot);
  const mergedInWindow = humanPrs.filter(
    (p) => p.mergedAt !== null && isInWindow(p.mergedAt, window),
  );

  const timeToFirstReview: number[] = [];
  for (const pr of mergedInWindow) {
    const review = firstHumanReview(pr, reviews);
    if (review) {
      timeToFirstReview.push(hoursBetween(pr.createdAt, review.submittedAt));
    }
  }

  const timeToMerge = mergedInWindow
    .filter((p) => p.mergedAt)
    .map((p) => hoursBetween(p.createdAt, p.mergedAt!));

  const humanReviewsInWindow = reviews.filter(
    (r) => !r.reviewer.isBot && isInWindow(r.submittedAt, window),
  );
  const distinctReviewers = new Set(
    humanReviewsInWindow.map((r) => r.reviewer.id),
  ).size;

  return {
    mergedPrCount: mergedInWindow.length,
    medianTimeToFirstReviewHours: round1(median(timeToFirstReview)),
    medianTimeToMergeHours: round1(median(timeToMerge)),
    distinctReviewers,
    reviewEvents: humanReviewsInWindow.length,
    sampleSizeMerged: mergedInWindow.length,
    sampleSizeReviewed: timeToFirstReview.length,
  };
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function buildEvidence(
  current: PeriodMetrics,
  previous: PeriodMetrics,
): EvidenceItem[] {
  return [
    {
      id: "ev-merged-pr-count",
      metric: "merged_pr_count",
      label: "Merged PRs",
      definition:
        "Count of human-authored pull requests with merged_at inside the requested window (bots excluded).",
      current: current.mergedPrCount,
      previous: previous.mergedPrCount,
      unit: "count",
      n: current.sampleSizeMerged,
      previousN: previous.sampleSizeMerged,
    },
    {
      id: "ev-median-tfr",
      metric: "median_time_to_first_review_hours",
      label: "Median time to first review (h)",
      definition:
        "Median hours from PR created_at to the first non-author human review, for human PRs merged in the window that received such a review.",
      current: current.medianTimeToFirstReviewHours,
      previous: previous.medianTimeToFirstReviewHours,
      unit: "hours",
      n: current.sampleSizeReviewed,
      previousN: previous.sampleSizeReviewed,
    },
    {
      id: "ev-median-ttm",
      metric: "median_time_to_merge_hours",
      label: "Median time to merge (h)",
      definition:
        "Median hours from created_at to merged_at for human PRs merged in the window.",
      current: current.medianTimeToMergeHours,
      previous: previous.medianTimeToMergeHours,
      unit: "hours",
      n: current.sampleSizeMerged,
      previousN: previous.sampleSizeMerged,
    },
    {
      id: "ev-review-participation",
      metric: "review_participation",
      label: "Review participation",
      definition:
        "Distinct human reviewers and total human review events with submitted_at in the window.",
      current: current.distinctReviewers,
      previous: previous.distinctReviewers,
      unit: "count",
      n: current.reviewEvents,
      previousN: previous.reviewEvents,
    },
  ];
}

export function computeInsights(
  repo: RepoRef,
  window: DateWindow,
  prs: PullRequest[],
  reviews: Review[],
  mode: "fixture" | "live",
): InsightsResult {
  const prior = priorWindow(window);
  const current = computePeriodMetrics(prs, reviews, window);
  const previous = computePeriodMetrics(prs, reviews, prior);
  const evidence = buildEvidence(current, previous);

  // Attach delta hints as part of labels via side channel is unnecessary;
  // narrative uses current/previous on evidence items.
  void pctChange;

  return {
    repo,
    window,
    priorWindow: prior,
    mode,
    current,
    previous,
    evidence,
    generatedAt: new Date().toISOString(),
  };
}
