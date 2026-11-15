import { NextRequest, NextResponse } from "next/server";
import { GitHubError } from "@/lib/github";
import { getInsights } from "@/lib/insights";
import { generateNarrative } from "@/lib/narrative";
import { narrativeBodySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = narrativeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const insights = await getInsights(
      { owner: parsed.data.owner, repo: parsed.data.repo },
      { from: parsed.data.from, to: parsed.data.to },
    );
    const narrative = await generateNarrative(insights);
    return NextResponse.json({ narrative, insights });
  } catch (err) {
    if (err instanceof GitHubError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("unknown evidence") || message.includes("structured")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    if (message.includes("No fixture")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
