# Interview notes

## Why these metrics?

Merged PR volume answers “did completed delivery change?” Time-to-first-review and time-to-merge help locate whether the change looks like review wait vs overall cycle time. Review participation adds a capacity signal. None of these equal individual performance.

## Correctness story

A PR created in September and merged in October counts in October because the metric measures **completed contribution**. The fixture includes `pr-1` and `pr-16` for this case, with hand-verified expected totals in `tests/metrics.test.ts`.

## AI-correction story worth telling

Generated GitHub clients often fetch only the first page. This codebase implements Link-header pagination and has a regression test (`tests/github-pagination.test.ts`) that fails if page 2 is dropped. Similarly, ranking-by-`created_at` would silently mis-attribute window membership; golden tests lock `merged_at` semantics.

## Confidence semantics

`confidence` is **not** calibrated probability and **not** a statement about metric accuracy. Counts are deterministic. Confidence is a documented heuristic for how strongly the *hypothesis* is supported by sample size and co-moving signals (e.g. volume drop + review-wait increase).

## What I intentionally did not build

- Background ingestion workers / webhooks
- Multi-repo portfolio views
- Auth / multi-tenant SaaS
- GraphQL
- Kubernetes

Prefer a small system done well over a loose platform.

## Live demo script (≈10 minutes)

1. Fixture dashboard: `acme/widget`, Oct 2026 — show metrics + narrative evidence chips.
2. Walk data flow: GitHub/fixture → SQLite events → metrics → evidence pack → narrative validator.
3. Show a failing case: hallucinated evidence id rejected; tiny window → insufficient evidence.
4. Trade-off: SQLite + sync refresh; path to workers + Postgres.
5. AI disclosure: what was generated vs what was owned.
