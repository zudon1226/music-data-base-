import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const recommendations: unknown[] = [];

    return NextResponse.json({
        ok: true,
        source: "client-computed",
        recommendations,
        songs: [],
        videos: [],
        albums: [],
        artists: [],
        producers: [],
    });
}
