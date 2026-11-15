/** Provider-neutral collaboration domain objects. */

export type Actor = {
  id: string;
  login: string;
  isBot: boolean;
};

export type PullRequest = {
  id: string;
  number: number;
  title: string;
  author: Actor;
  createdAt: string; // ISO
  mergedAt: string | null;
  closedAt: string | null;
  state: "open" | "closed" | "merged";
};

export type Review = {
  id: string;
  pullRequestId: string;
  reviewer: Actor;
  submittedAt: string; // ISO
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
};

export type DateWindow = {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
};

export type RepoRef = {
  owner: string;
  repo: string;
};

export type MetricKey =
  | "merged_pr_count"
  | "median_time_to_first_review_hours"
  | "median_time_to_merge_hours"
  | "review_participation";

export type EvidenceItem = {
  id: string;
  metric: MetricKey;
  label: string;
  definition: string;
  current: number | null;
  previous: number | null;
  unit: "count" | "hours" | "ratio";
  n: number;
  previousN: number;
};

export type PeriodMetrics = {
  mergedPrCount: number;
  medianTimeToFirstReviewHours: number | null;
  medianTimeToMergeHours: number | null;
  distinctReviewers: number;
  reviewEvents: number;
  sampleSizeMerged: number;
  sampleSizeReviewed: number;
};

export type InsightsResult = {
  repo: RepoRef;
  window: DateWindow;
  priorWindow: DateWindow;
  mode: "fixture" | "live";
  current: PeriodMetrics;
  previous: PeriodMetrics;
  evidence: EvidenceItem[];
  generatedAt: string;
};

export type NarrativeResult = {
  summary: string;
  hypothesis: string;
  confidence: number;
  confidenceBasis: string;
  evidenceIds: string[];
  insufficientEvidence: boolean;
  mode: "fixture" | "live";
};
