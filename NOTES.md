# Submission notes

## 1. How to run it locally

**Prerequisites:** Node.js 20+, npm. Docker optional.

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847) and analyze fixture repo `acme/widget` for `2026-10-01` → `2026-10-31`.

Or with Docker: `docker compose up --build`.

| Env var | Required? | Purpose |
|---|---|---|
| `APP_MODE` | No (default `fixture` without token) | `fixture` or `live` |
| `GITHUB_TOKEN` | Live mode only | Read-only GitHub access |
| `XAI_API_KEY` | Optional | Live Grok narratives; without it, deterministic fixture narrative |
| `DB_PATH` | No | SQLite path (default `./data/insights.sqlite`) |
| `CACHE_TTL_SECONDS` | No | GitHub cache freshness (default `900`) |

Fixture mode needs **no** API keys. Tests: `npm test`. More detail in [README.md](README.md).

## 2. Architecture tour

Request path: Dashboard/curl → Next.js API routes → ingestion (fixture seed or GitHub REST into SQLite) → deterministic metrics engine → evidence pack → optional narrative (fixture heuristic or Grok/xAI) with `evidence_id` validation.

Main decisions: keep metric math out of the LLM (counts are deterministic; the model only hypothesizes from a structured evidence pack); use SQLite + synchronous refresh for one-command local demos instead of workers/Postgres; validate owner/repo as identifier segments and cap date ranges; reject invented evidence IDs so narratives stay grounded. Provider clients only fetch/normalize — domain objects stay provider-neutral so another issue tracker could plug in later without rewriting aggregations.

## 3. If I had another day

I would split GitHub ingestion into a queue-backed background worker (webhooks + scheduled refresh) and serve queries from stored events only, then swap SQLite for Postgres behind the same store boundary. Next I’d add a multi-repo portfolio view with shared date windows, and tighten live-mode UX around rate limits / partial refresh. GraphQL, auth, and multi-tenant SaaS stay out of scope until the single-repo path is boringly reliable.

## 4. AI disclosure

AI coding assistance helped with scaffolding, repetitive test/boilerplate drafting, and refactor suggestions. Metric semantics, evidence schema, cache/freshness policy, LLM grounding rules, and fixture hand-counts were specified and verified manually. Generated code was reviewed; pagination and `created_at` vs `merged_at` window membership have regression tests rather than trusting generation.

---

## Appendix — demo / correctness talking points

**Why these metrics?** Merged PR volume answers “did completed delivery change?” Time-to-first-review and time-to-merge locate review wait vs overall cycle time. Review participation adds a capacity signal. None equal individual performance.

**Correctness:** A PR created in September and merged in October counts in October (`merged_at`). Fixture `pr-1` / `pr-16` lock this in `tests/metrics.test.ts`. Link-header pagination is covered by `tests/github-pagination.test.ts`.

**Confidence:** Not calibrated probability and not a statement about count accuracy. It is a heuristic for how strongly the *hypothesis* is supported by sample size and co-moving signals.

**Demo (~10 min):** fixture dashboard → data flow → hallucinated evidence id rejected / tiny-N insufficient evidence → SQLite trade-off → AI disclosure.
