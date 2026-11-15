import { NextResponse } from "next/server";
import { getAppMode } from "@/lib/config";
import { listFixtureRepos } from "@/lib/fixtures";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: getAppMode(),
    fixtures: listFixtureRepos(),
    time: new Date().toISOString(),
  });
}
