import type { DateWindow, InsightsResult, RepoRef } from "./domain";
import { ensureRepoData } from "./ingest";
import { computeInsights } from "./metrics";

export async function getInsights(
  repo: RepoRef,
  window: DateWindow,
): Promise<InsightsResult> {
  const data = await ensureRepoData(repo.owner, repo.repo);
  return computeInsights(repo, window, data.prs, data.reviews, data.mode);
}
