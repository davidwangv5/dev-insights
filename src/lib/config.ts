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

/** xAI / Grok API key. Also accepts GROK_API_KEY as an alias. */
export function getXaiApiKey(): string | undefined {
  return (
    process.env.XAI_API_KEY ||
    process.env.GROK_API_KEY ||
    undefined
  );
}

export function getXaiBaseUrl(): string {
  return (
    process.env.XAI_BASE_URL ||
    process.env.GROK_BASE_URL ||
    "https://api.x.ai/v1"
  ).replace(/\/$/, "");
}

export function getGrokModel(): string {
  return (
    process.env.XAI_MODEL ||
    process.env.GROK_MODEL ||
    "grok-4.7"
  );
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
