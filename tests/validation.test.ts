import { describe, expect, it } from "vitest";
import { insightsQuerySchema } from "@/lib/validation";

describe("input validation", () => {
  it("accepts valid owner/repo/dates", () => {
    const parsed = insightsQuerySchema.safeParse({
      owner: "acme",
      repo: "widget",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects arbitrary URLs / path injection in owner", () => {
    const parsed = insightsQuerySchema.safeParse({
      owner: "../etc",
      repo: "widget",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects inverted date ranges", () => {
    const parsed = insightsQuerySchema.safeParse({
      owner: "acme",
      repo: "widget",
      from: "2026-11-01",
      to: "2026-10-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects ranges longer than 90 days", () => {
    const parsed = insightsQuerySchema.safeParse({
      owner: "acme",
      repo: "widget",
      from: "2026-01-01",
      to: "2026-06-01",
    });
    expect(parsed.success).toBe(false);
  });
});
