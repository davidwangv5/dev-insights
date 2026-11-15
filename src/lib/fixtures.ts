import fs from "node:fs";
import path from "node:path";
import type { PullRequest, Review } from "./domain";
import { clearRepo, setSyncState, upsertPullRequests, upsertReviews } from "./db";

export type FixtureFile = {
  owner: string;
  repo: string;
  pullRequests: PullRequest[];
  reviews: Review[];
};

const FIXTURE_MAP: Record<string, string> = {
  "acme/widget": "acme-widget.json",
};

export function resolveFixturePath(owner: string, repo: string): string | null {
  const key = `${owner}/${repo}`;
  const file = FIXTURE_MAP[key];
  if (!file) return null;
  return path.join(process.cwd(), "fixtures", file);
}

export function loadFixtureFile(filePath: string): FixtureFile {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as FixtureFile;
}

export function seedFixtureRepo(owner: string, repo: string): boolean {
  const filePath = resolveFixturePath(owner, repo);
  if (!filePath || !fs.existsSync(filePath)) return false;
  const data = loadFixtureFile(filePath);
  clearRepo(owner, repo);
  upsertPullRequests(owner, repo, data.pullRequests);
  upsertReviews(owner, repo, data.reviews);
  setSyncState(owner, repo, "pulls", "fixture");
  setSyncState(owner, repo, "reviews", "fixture");
  return true;
}

export function listFixtureRepos(): string[] {
  return Object.keys(FIXTURE_MAP);
}
