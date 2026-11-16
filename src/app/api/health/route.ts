import { NextResponse } from "next/server";
import { getAppMode, getGrokModel, getXaiApiKey } from "@/lib/config";
import { listFixtureRepos } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: getAppMode(),
    llm: {
      provider: "xai-grok",
      configured: Boolean(getXaiApiKey()),
      model: getGrokModel(),
    },
    fixtures: listFixtureRepos(),
    time: new Date().toISOString(),
  });
}
