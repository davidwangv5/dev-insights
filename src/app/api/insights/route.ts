import { NextRequest, NextResponse } from "next/server";
import { GitHubError } from "@/lib/github";
import { getInsights } from "@/lib/insights";
import { insightsQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const parsed = insightsQuerySchema.safeParse({
    owner: url.searchParams.get("owner"),
    repo: url.searchParams.get("repo"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const insights = await getInsights(
      { owner: parsed.data.owner, repo: parsed.data.repo },
      { from: parsed.data.from, to: parsed.data.to },
    );
    return NextResponse.json(insights);
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json(
        { error: err.message, rateLimitRemaining: err.rateLimitRemaining },
        { status: err.status === 404 ? 404 : 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("No fixture") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
