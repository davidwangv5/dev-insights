export type AppMode = "fixture" | "live";

export function getAppMode(): AppMode {
  const forced = process.env.APP_MODE?.toLowerCase();
  if (forced === "fixture") return "fixture";
  if (forced === "live") return "live";
  // Auto: fixture unless a GitHub token is present
  return process.env.GITHUB_TOKEN ? "live" : "fixture";
}

export function getGithubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || undefined;
}

export function getOpenAIKey(): string | undefined {
  return process.env.OPENAI_API_KEY || undefined;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function getCacheTtlSeconds(): number {
  const raw = process.env.CACHE_TTL_SECONDS;
  const n = raw ? Number(raw) : 900;
  return Number.isFinite(n) && n >= 0 ? n : 900;
}

export function getDbPath(): string {
  return process.env.DB_PATH || "./data/insights.sqlite";
}

export const MAX_DATE_RANGE_DAYS = 90;
export const MIN_SAMPLE_FOR_HYPOTHESIS = 5;
