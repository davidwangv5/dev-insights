import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDbPath } from "./config";
import type { PullRequest, Review } from "./domain";

let dbSingleton: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  dbSingleton = db;
  return db;
}

/** Test helper: use an in-memory DB and reset singleton. */
export function useMemoryDb(): Database.Database {
  if (dbSingleton) {
    try {
      dbSingleton.close();
    } catch {
      /* ignore */
    }
  }
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  dbSingleton = db;
  return db;
}

export function closeDb(): void {
  if (dbSingleton) {
    dbSingleton.close();
    dbSingleton = null;
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      resource TEXT NOT NULL,
      etag TEXT,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (owner, repo, resource)
    );

    CREATE TABLE IF NOT EXISTS pull_requests (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_login TEXT NOT NULL,
      author_is_bot INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      merged_at TEXT,
      closed_at TEXT,
      state TEXT NOT NULL,
      UNIQUE (owner, repo, number)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      pull_request_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewer_login TEXT NOT NULL,
      reviewer_is_bot INTEGER NOT NULL,
      submitted_at TEXT NOT NULL,
      state TEXT NOT NULL,
      FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prs_repo ON pull_requests(owner, repo);
    CREATE INDEX IF NOT EXISTS idx_prs_merged ON pull_requests(owner, repo, merged_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_pr ON reviews(pull_request_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_submitted ON reviews(owner, repo, submitted_at);
  `);
}

export function upsertPullRequests(
  owner: string,
  repo: string,
  prs: PullRequest[],
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO pull_requests (
      id, owner, repo, number, title,
      author_id, author_login, author_is_bot,
      created_at, merged_at, closed_at, state
    ) VALUES (
      @id, @owner, @repo, @number, @title,
      @author_id, @author_login, @author_is_bot,
      @created_at, @merged_at, @closed_at, @state
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      author_id=excluded.author_id,
      author_login=excluded.author_login,
      author_is_bot=excluded.author_is_bot,
      created_at=excluded.created_at,
      merged_at=excluded.merged_at,
      closed_at=excluded.closed_at,
      state=excluded.state
  `);

  const tx = db.transaction((rows: PullRequest[]) => {
    for (const pr of rows) {
      stmt.run({
        id: pr.id,
        owner,
        repo,
        number: pr.number,
        title: pr.title,
        author_id: pr.author.id,
        author_login: pr.author.login,
        author_is_bot: pr.author.isBot ? 1 : 0,
        created_at: pr.createdAt,
        merged_at: pr.mergedAt,
        closed_at: pr.closedAt,
        state: pr.state,
      });
    }
  });
  tx(prs);
}

export function upsertReviews(owner: string, repo: string, reviews: Review[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reviews (
      id, owner, repo, pull_request_id,
      reviewer_id, reviewer_login, reviewer_is_bot,
      submitted_at, state
    ) VALUES (
      @id, @owner, @repo, @pull_request_id,
      @reviewer_id, @reviewer_login, @reviewer_is_bot,
      @submitted_at, @state
    )
    ON CONFLICT(id) DO UPDATE SET
      reviewer_id=excluded.reviewer_id,
      reviewer_login=excluded.reviewer_login,
      reviewer_is_bot=excluded.reviewer_is_bot,
      submitted_at=excluded.submitted_at,
      state=excluded.state
  `);

  const tx = db.transaction((rows: Review[]) => {
    for (const r of rows) {
      stmt.run({
        id: r.id,
        owner,
        repo,
        pull_request_id: r.pullRequestId,
        reviewer_id: r.reviewer.id,
        reviewer_login: r.reviewer.login,
        reviewer_is_bot: r.reviewer.isBot ? 1 : 0,
        submitted_at: r.submittedAt,
        state: r.state,
      });
    }
  });
  tx(reviews);
}

export function setSyncState(
  owner: string,
  repo: string,
  resource: string,
  etag: string | null,
): void {
  getDb()
    .prepare(
      `INSERT INTO sync_state (owner, repo, resource, etag, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(owner, repo, resource) DO UPDATE SET
         etag=excluded.etag,
         fetched_at=excluded.fetched_at`,
    )
    .run(owner, repo, resource, etag, new Date().toISOString());
}

export function getSyncState(
  owner: string,
  repo: string,
  resource: string,
): { etag: string | null; fetchedAt: string } | null {
  const row = getDb()
    .prepare(
      `SELECT etag, fetched_at AS fetchedAt FROM sync_state
       WHERE owner = ? AND repo = ? AND resource = ?`,
    )
    .get(owner, repo, resource) as
    | { etag: string | null; fetchedAt: string }
    | undefined;
  return row ?? null;
}

export function loadPullRequests(owner: string, repo: string): PullRequest[] {
  const rows = getDb()
    .prepare(
      `SELECT id, number, title, author_id, author_login, author_is_bot,
              created_at, merged_at, closed_at, state
       FROM pull_requests WHERE owner = ? AND repo = ?`,
    )
    .all(owner, repo) as Array<{
    id: string;
    number: number;
    title: string;
    author_id: string;
    author_login: string;
    author_is_bot: number;
    created_at: string;
    merged_at: string | null;
    closed_at: string | null;
    state: "open" | "closed" | "merged";
  }>;

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    author: {
      id: r.author_id,
      login: r.author_login,
      isBot: Boolean(r.author_is_bot),
    },
    createdAt: r.created_at,
    mergedAt: r.merged_at,
    closedAt: r.closed_at,
    state: r.state,
  }));
}

export function loadReviews(owner: string, repo: string): Review[] {
  const rows = getDb()
    .prepare(
      `SELECT id, pull_request_id, reviewer_id, reviewer_login, reviewer_is_bot,
              submitted_at, state
       FROM reviews WHERE owner = ? AND repo = ?`,
    )
    .all(owner, repo) as Array<{
    id: string;
    pull_request_id: string;
    reviewer_id: string;
    reviewer_login: string;
    reviewer_is_bot: number;
    submitted_at: string;
    state: Review["state"];
  }>;

  return rows.map((r) => ({
    id: r.id,
    pullRequestId: r.pull_request_id,
    reviewer: {
      id: r.reviewer_id,
      login: r.reviewer_login,
      isBot: Boolean(r.reviewer_is_bot),
    },
    submittedAt: r.submitted_at,
    state: r.state,
  }));
}

export function clearRepo(owner: string, repo: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM reviews WHERE owner = ? AND repo = ?`).run(owner, repo);
    db.prepare(`DELETE FROM pull_requests WHERE owner = ? AND repo = ?`).run(
      owner,
      repo,
    );
    db.prepare(`DELETE FROM sync_state WHERE owner = ? AND repo = ?`).run(
      owner,
      repo,
    );
  });
  tx();
}
