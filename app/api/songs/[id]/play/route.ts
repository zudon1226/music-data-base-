import { NextResponse } from "next/server";
import { recordSongPlay } from "@/lib/song-play-server";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const result = await recordSongPlay(request, id);
        return NextResponse.json(result.body, { status: result.status });
    }
    catch (error) {
        console.error("[api/songs/:id/play] error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}