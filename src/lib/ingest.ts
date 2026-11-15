import {
  getAppMode,
  getCacheTtlSeconds,
  getGithubToken,
} from "./config";
import {
  getSyncState,
  loadPullRequests,
  loadReviews,
  setSyncState,
  upsertPullRequests,
  upsertReviews,
} from "./db";
import { seedFixtureRepo } from "./fixtures";
import { GitHubClient, GitHubError } from "./github";
import type { PullRequest, Review } from "./domain";

export type IngestResult = {
  mode: "fixture" | "live";
  prs: PullRequest[];
  reviews: Review[];
  refreshed: boolean;
};

function isFresh(fetchedAt: string | null | undefined, ttlSeconds: number): boolean {
  if (!fetchedAt) return false;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs < ttlSeconds * 1000;
}

export async function ensureRepoData(
  owner: string,
  repo: string,
): Promise<IngestResult> {
  const mode = getAppMode();

  if (mode === "fixture") {
    const sync = getSyncState(owner, repo, "pulls");
    if (!sync) {
      const ok = seedFixtureRepo(owner, repo);
      if (!ok) {
        throw new Error(
          `No fixture for ${owner}/${repo}. Available demo: acme/widget`,
        );
      }
      return {
        mode,
        prs: loadPullRequests(owner, repo),
        reviews: loadReviews(owner, repo),
        refreshed: true,
      };
    }
    return {
      mode,
      prs: loadPullRequests(owner, repo),
      reviews: loadReviews(owner, repo),
      refreshed: false,
    };
  }

  const ttl = getCacheTtlSeconds();
  const pullsSync = getSyncState(owner, repo, "pulls");
  if (pullsSync && isFresh(pullsSync.fetchedAt, ttl)) {
    return {
      mode,
      prs: loadPullRequests(owner, repo),
      reviews: loadReviews(owner, repo),
      refreshed: false,
    };
  }

  const token = getGithubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is required in live mode");
  }

  const client = new GitHubClient({ token });
  try {
    const { prs, etag, notModified } = await client.listPullRequests(
      owner,
      repo,
      pullsSync?.etag,
    );

    if (notModified) {
      setSyncState(owner, repo, "pulls", pullsSync?.etag ?? etag);
      return {
        mode,
        prs: loadPullRequests(owner, repo),
        reviews: loadReviews(owner, repo),
        refreshed: false,
      };
    }

    upsertPullRequests(owner, repo, prs);

    const allReviews: Review[] = [];
    // Bound review fetching for demo workloads: newest 80 PRs.
    const reviewTargets = prs.slice(0, 80);
    for (const pr of reviewTargets) {
      const reviews = await client.listReviewsForPull(
        owner,
        repo,
        pr.number,
        pr.id,
      );
      allReviews.push(...reviews);
    }
    upsertReviews(owner, repo, allReviews);
    setSyncState(owner, repo, "pulls", etag);
    setSyncState(owner, repo, "reviews", null);

    return {
      mode,
      prs: loadPullRequests(owner, repo),
      reviews: loadReviews(owner, repo),
      refreshed: true,
    };
  } catch (err) {
    if (err instanceof GitHubError) throw err;
    throw err;
  }
}
