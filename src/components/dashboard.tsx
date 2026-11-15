"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InsightsResult, NarrativeResult } from "@/lib/domain";
import { cn } from "@/lib/utils";

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

const DEFAULT_OWNER = "acme";
const DEFAULT_REPO = "widget";
const DEFAULT_FROM = "2026-10-01";
const DEFAULT_TO = "2026-10-31";

export function Dashboard() {
  const [owner, setOwner] = useState(DEFAULT_OWNER);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAnalysis() {
    setError(null);
    setState("loading");
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({ owner, repo, from, to });
        const insightsRes = await fetch(`/api/insights?${qs.toString()}`);
        const insightsJson = await insightsRes.json();
        if (!insightsRes.ok) {
          throw new Error(insightsJson.error || "Failed to load insights");
        }

        const narrativeRes = await fetch("/api/insights/narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, repo, from, to }),
        });
        const narrativeJson = await narrativeRes.json();
        if (!narrativeRes.ok) {
          throw new Error(narrativeJson.error || "Failed to load narrative");
        }

        const result = insightsJson as InsightsResult;
        setInsights(result);
        setNarrative(narrativeJson.narrative as NarrativeResult);
        setState(result.current.mergedPrCount === 0 ? "empty" : "ready");
      } catch (err) {
        setInsights(null);
        setNarrative(null);
        setState("error");
        setError(err instanceof Error ? err.message : "Unexpected error");
      }
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.14),_transparent_55%),linear-gradient(160deg,#f4f7f5_0%,#e8eef2_45%,#f7f3ea_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14">
        <header className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          <p className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-slate-900 sm:text-5xl">
            Collab Signal
          </p>
          <p className="mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
            See whether delivery slowed — and whether the bottleneck looks like
            authoring, review wait, or merge — with numbers first, narrative
            second.
          </p>
        </header>

        <section
          className="animate-in fade-in slide-in-from-bottom-3 rounded-2xl border border-slate-900/10 bg-white/70 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur duration-700 delay-100 sm:p-6"
          style={{ animationFillMode: "both" }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Owner" htmlFor="owner">
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value.trim())}
                placeholder="acme"
                autoComplete="off"
              />
            </Field>
            <Field label="Repo" htmlFor="repo">
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value.trim())}
                placeholder="widget"
                autoComplete="off"
              />
            </Field>
            <Field label="From" htmlFor="from">
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="to">
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={runAnalysis}
              disabled={pending || state === "loading"}
              className="bg-teal-800 text-teal-50 hover:bg-teal-900"
            >
              {pending || state === "loading" ? "Analyzing…" : "Analyze window"}
            </Button>
            <p className="text-sm text-slate-500">
              Fixture demo: <code className="text-slate-700">acme/widget</code>{" "}
              for Oct 2026. No tokens required.
            </p>
          </div>
        </section>

        {state === "idle" && (
          <p className="text-sm text-slate-500">
            Choose a repository and date window, then run analysis.
          </p>
        )}

        {state === "loading" && (
          <div className="animate-pulse space-y-3 rounded-xl border border-dashed border-slate-300/80 bg-white/40 p-6">
            <div className="h-4 w-40 rounded bg-slate-200" />
            <div className="h-16 rounded bg-slate-200/80" />
            <div className="h-24 rounded bg-slate-200/60" />
          </div>
        )}

        {state === "error" && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900"
          >
            {error}
          </div>
        )}

        {(state === "ready" || state === "empty") && insights && (
          <div className="animate-in fade-in slide-in-from-bottom-2 space-y-8 duration-500">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="uppercase tracking-wide">
                {insights.mode} mode
              </Badge>
              <span className="text-sm text-slate-500">
                {insights.repo.owner}/{insights.repo.repo} · {insights.window.from}{" "}
                → {insights.window.to} · prior {insights.priorWindow.from} →{" "}
                {insights.priorWindow.to}
              </span>
            </div>

            {state === "empty" ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
                No merged human pull requests in this window. Try a wider range
                or another repository.
              </p>
            ) : (
              <section className="grid gap-3 sm:grid-cols-2">
                {insights.evidence.map((ev) => (
                  <article
                    key={ev.id}
                    className={cn(
                      "rounded-xl border border-slate-900/10 bg-white/80 p-4 transition duration-300",
                      highlightId === ev.id &&
                        "border-teal-600 ring-2 ring-teal-600/30",
                    )}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      {ev.label}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-slate-900">
                      {formatValue(ev.current, ev.unit)}
                      <span className="ml-2 text-base font-normal text-slate-500">
                        vs {formatValue(ev.previous, ev.unit)}
                      </span>
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{ev.definition}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      n={ev.n} · prior n={ev.previousN} · {ev.id}
                    </p>
                  </article>
                ))}
              </section>
            )}

            {narrative && (
              <section className="rounded-2xl border border-slate-900/10 bg-slate-900 px-5 py-6 text-slate-50 sm:px-7">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-300/90">
                  Evidence-grounded narrative
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl leading-snug sm:text-3xl">
                  {narrative.summary}
                </h2>
                <p className="mt-4 text-base text-slate-200">
                  <span className="font-semibold text-teal-200">Hypothesis: </span>
                  {narrative.hypothesis}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span>
                    Confidence {narrative.confidence.toFixed(2)} —{" "}
                    {narrative.confidenceBasis}
                  </span>
                  {narrative.insufficientEvidence && (
                    <Badge className="bg-amber-400 text-amber-950">
                      insufficient evidence
                    </Badge>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {narrative.evidenceIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setHighlightId((cur) => (cur === id ? null : id))
                      }
                      className="rounded-full border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs text-teal-100 transition hover:bg-teal-400/20"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function formatValue(
  value: number | null,
  unit: "count" | "hours" | "ratio",
): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (unit === "hours") return `${value}h`;
  if (unit === "ratio") return value.toFixed(2);
  return String(value);
}
