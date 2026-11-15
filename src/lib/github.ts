import type { Actor, PullRequest, Review } from "./domain";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimitRemaining?: number | null,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export type GitHubClientOptions = {
  token?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type GhUser = {
  id: number;
  login: string;
  type?: string;
};

type GhPull = {
  id: number;
  number: number;
  title: string;
  user: GhUser | null;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  state: string;
};

type GhReview = {
  id: number;
  user: GhUser | null;
  submitted_at: string | null;
  state: string;
};

function isBot(user: GhUser | null): boolean {
  if (!user) return false;
  if (user.type === "Bot") return true;
  return /\[bot\]$/i.test(user.login) || user.login.endsWith("-bot");
}

function toActor(user: GhUser | null): Actor {
  if (!user) {
    return { id: "unknown", login: "unknown", isBot: false };
  }
  return {
    id: String(user.id),
    login: user.login,
    isBot: isBot(user),
  };
}

function normalizePr(pr: GhPull): PullRequest {
  const merged = Boolean(pr.merged_at);
  return {
    id: `gh-pr-${pr.id}`,
    number: pr.number,
    title: pr.title,
    author: toActor(pr.user),
    createdAt: pr.created_at,
    mergedAt: pr.merged_at,
    closedAt: pr.closed_at,
    state: merged ? "merged" : pr.state === "open" ? "open" : "closed",
  };
}

function normalizeReview(prId: string, review: GhReview): Review | null {
  if (!review.submitted_at) return null;
  const state = review.state.toUpperCase();
  const allowed = [
    "APPROVED",
    "CHANGES_REQUESTED",
    "COMMENTED",
    "DISMISSED",
    "PENDING",
  ] as const;
  const normalized = allowed.includes(state as (typeof allowed)[number])
    ? (state as Review["state"])
    : "COMMENTED";
  return {
    id: `gh-rv-${review.id}`,
    pullRequestId: prId,
    reviewer: toActor(review.user),
    submittedAt: review.submitted_at,
    state: normalized,
  };
}

/** Parse GitHub Link header for rel="next". */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export class GitHubClient {
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: GitHubClientOptions = {}) {
    this.token = opts.token;
    this.baseUrl = (opts.baseUrl || "https://api.github.com").replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl || fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private headers(etag?: string | null): HeadersInit {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "collab-insights/1.0",
    };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (etag) h["If-None-Match"] = etag;
    return h;
  }

  async requestJson<T>(
    url: string,
    etag?: string | null,
  ): Promise<{
    status: number;
    data: T | null;
    etag: string | null;
    link: string | null;
    rateLimitRemaining: number | null;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        headers: this.headers(etag),
        signal: controller.signal,
      });
      const remainingRaw = res.headers.get("x-ratelimit-remaining");
      const rateLimitRemaining =
        remainingRaw === null ? null : Number(remainingRaw);
      const nextEtag = res.headers.get("etag");
      const link = res.headers.get("link");

      if (res.status === 304) {
        return {
          status: 304,
          data: null,
          etag: nextEtag || etag || null,
          link,
          rateLimitRemaining,
        };
      }

      if (res.status === 403 || res.status === 429) {
        throw new GitHubError(
          `GitHub rate limit or forbidden (${res.status})`,
          res.status,
          rateLimitRemaining,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new GitHubError(
          `GitHub API error ${res.status}: ${body.slice(0, 200)}`,
          res.status,
          rateLimitRemaining,
        );
      }

      const data = (await res.json()) as T;
      return {
        status: res.status,
        data,
        etag: nextEtag,
        link,
        rateLimitRemaining,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch all pages for a collection endpoint.
   * Follows Link rel="next" until exhausted.
   */
  async fetchAllPages<T>(
    firstUrl: string,
    etag?: string | null,
  ): Promise<{ items: T[]; etag: string | null; notModified: boolean }> {
    const first = await this.requestJson<T[]>(firstUrl, etag);
    if (first.status === 304) {
      return { items: [], etag: first.etag, notModified: true };
    }
    const items = [...(first.data || [])];
    let next = parseNextLink(first.link);
    let lastEtag = first.etag;

    // Subsequent pages intentionally omit If-None-Match; we only cache the
    // first-page ETag as a cheap freshness signal for the collection.
    while (next) {
      const page = await this.requestJson<T[]>(next);
      items.push(...(page.data || []));
      lastEtag = page.etag || lastEtag;
      next = parseNextLink(page.link);
    }

    return { items, etag: lastEtag, notModified: false };
  }

  async listPullRequests(
    owner: string,
    repo: string,
    etag?: string | null,
  ): Promise<{ prs: PullRequest[]; etag: string | null; notModified: boolean }> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls?state=all&per_page=100&sort=updated&direction=desc`;
    const result = await this.fetchAllPages<GhPull>(url, etag);
    return {
      prs: result.items.map(normalizePr),
      etag: result.etag,
      notModified: result.notModified,
    };
  }

  async listReviewsForPull(
    owner: string,
    repo: string,
    prNumber: number,
    prId: string,
  ): Promise<Review[]> {
    const url = `${this.baseUrl}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`;
    const result = await this.fetchAllPages<GhReview>(url);
    return result.items
      .map((r) => normalizeReview(prId, r))
      .filter((r): r is Review => r !== null);
  }
}
