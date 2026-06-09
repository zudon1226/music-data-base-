import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    return NextResponse.json({
        ok: true,
        source: "client-computed",
        forYou: [],
        trending: [],
        newReleases: [],
        suggestedCreators: [],
        creatorGrowth: [],
    });
}
