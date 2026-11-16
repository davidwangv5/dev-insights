# Collab Signal

GitHub collaboration intelligence for engineering teams. Collab Signal computes **deterministic delivery and review metrics** over a date window, then optionally produces an **evidence-grounded LLM narrative** with a hypothesis, confidence score, and evidence chain.

It answers a practical question:

> Did delivery slow down recently — and does the bottleneck look more like authoring, review wait, or merge?

## 60-second quickstart

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847) and analyze fixture repo `acme/widget` for `2026-10-01` → `2026-10-31`.

Or with Docker:

```bash
cp .env.example .env
docker compose up --build
```

### Sample API calls

```bash
curl "http://localhost:3847/api/health"

curl "http://localhost:3847/api/insights?owner=acme&repo=widget&from=2026-10-01&to=2026-10-31"

curl -X POST "http://localhost:3847/api/insights/narrative" \
  -H "content-type: application/json" \
  -d '{"owner":"acme","repo":"widget","from":"2026-10-01","to":"2026-10-31"}'
```

Fixture mode needs **no** `GITHUB_TOKEN` or `XAI_API_KEY`.

## Metric definitions

| Metric | Definition |
|---|---|
| `merged_pr_count` | Human-authored PRs with `merged_at` in the window (bots excluded). Uses **`merged_at`**, not `created_at`, so work finished in the period is counted even if started earlier. |
| `median_time_to_first_review_hours` | Median hours from `created_at` to the first **non-author human** review, for human PRs merged in the window that received such a review. |
| `median_time_to_merge_hours` | Median hours from `created_at` to `merged_at` for human PRs merged in the window. |
| `review_participation` | Distinct human reviewers + total human review events with `submitted_at` in the window. |

Each request also computes an equal-length **prior window** for deltas. Merged-PR count is a delivery activity signal — not a performance score for individuals.

## Architecture

```text
Dashboard / curl
    → API routes
        → Ingestion (fixture seed or GitHub REST + SQLite cache)
        → Deterministic metrics engine → evidence pack
        → Narrative service (fixture heuristic or Grok/xAI structured output)
            → evidence_id validation
```

Provider clients only fetch/normalize. Metric math never runs inside the LLM. Raw PR bodies/comments are not sent to the model (prompt-injection reduction).

See [docs/architecture.md](docs/architecture.md).

## LLM contract

1. Application computes metrics and builds an evidence pack (`id`, metric, current/previous, `n`, definition).
2. Model receives only that pack plus rules: facts vs hypothesis, no invented numbers, cite only provided IDs.
3. Response is schema-constrained; the server rejects unknown `evidence_ids`.
4. `confidence` is **hypothesis confidence** (heuristic from sample size + effect consistency), not confidence in the counts.
5. If `n < 5` merged PRs, the system returns `insufficientEvidence: true`.

## Modes

- **`APP_MODE=fixture`** (default without `GITHUB_TOKEN`): seeds `fixtures/acme-widget.json`, deterministic narrative.
- **`APP_MODE=live`**: GitHub pagination + ETag-aware refresh into SQLite.
- **Live Grok narrative**: when `XAI_API_KEY` (or `GROK_API_KEY`) is set, narratives use xAI's OpenAI-compatible API (`https://api.x.ai/v1`, default model `grok-4.7`) with structured JSON schema. Without a key, the deterministic fixture narrative is used.

## Trade-offs

- **SQLite over Postgres** for one-command local reproducibility. Persistence is isolated behind the ingestion/metrics boundary.
- **Synchronous refresh, no worker** for the expected demo workload. At larger scale, separate ingestion into a queue-backed worker and serve queries from stored events only.
- **No multi-provider adapters** in v1. Domain objects are provider-neutral so a Linear/Jira adapter can plug in later without changing metric math.

## Security notes

- Owner/repo are validated identifier segments — not arbitrary URLs (avoids turning the API into an SSRF primitive).
- Date ranges capped at 90 days.
- Secrets via env vars only; use a read-only GitHub token in live mode.
- Logs should not print tokens (none are echoed by handlers).

## Tests

```bash
npm test
```

High-signal coverage: golden fixture counts, `merged_at` window semantics, bot exclusion, pagination, evidence-id validation, tiny-N insufficient evidence, input validation.

## AI disclosure

AI coding assistance was used for scaffolding, repetitive test/boilerplate drafting, and refactor suggestions. Metric semantics, evidence schema, cache/freshness policy, LLM grounding rules, and fixture hand-counts were specified and verified manually. Generated code was reviewed; pagination and `created_at` vs `merged_at` behavior were explicitly tested rather than trusted from generation.

## Project layout

```text
src/lib/          domain, db, github, ingest, metrics, narrative
src/app/api/      health, insights, narrative
src/components/   dashboard UI
fixtures/         deterministic GitHub-like dataset
tests/            vitest suites
docs/             architecture notes
```
