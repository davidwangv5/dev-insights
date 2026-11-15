import { z } from "zod";
import { MAX_DATE_RANGE_DAYS } from "./config";
import type { DateWindow, RepoRef } from "./domain";

const ownerRepoSegment = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "Must be a GitHub identifier segment");

export const repoRefSchema = z.object({
  owner: ownerRepoSegment,
  repo: ownerRepoSegment,
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const dateWindowSchema = z
  .object({
    from: dateString,
    to: dateString,
  })
  .superRefine((val, ctx) => {
    const from = parseUtcDate(val.from);
    const to = parseUtcDate(val.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date", path: ["from"] });
      return;
    }
    if (from.getTime() > to.getTime()) {
      ctx.addIssue({
        code: "custom",
        message: "`from` must be on or before `to`",
        path: ["from"],
      });
    }
    const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > MAX_DATE_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        message: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`,
        path: ["to"],
      });
    }
  });

export const insightsQuerySchema = repoRefSchema.and(dateWindowSchema);

export const narrativeBodySchema = insightsQuerySchema;

export function parseUtcDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function endOfUtcDay(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

export function priorWindow(window: DateWindow): DateWindow {
  const from = parseUtcDate(window.from);
  const to = parseUtcDate(window.to);
  const lengthMs = to.getTime() - from.getTime();
  const priorTo = new Date(from.getTime() - 86_400_000);
  const priorFrom = new Date(priorTo.getTime() - lengthMs);
  return {
    from: formatUtcDate(priorFrom),
    to: formatUtcDate(priorTo),
  };
}

export function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isInWindow(iso: string, window: DateWindow): boolean {
  const t = new Date(iso).getTime();
  return t >= parseUtcDate(window.from).getTime() && t <= endOfUtcDay(window.to).getTime();
}

export type ParsedInsightsInput = RepoRef & DateWindow;
