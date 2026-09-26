import { listFoundingArtistsForDiscovery } from "@/lib/founding-artist-designation";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = getSupabaseServerClient();
        const artists = await listFoundingArtistsForDiscovery(supabase, 32);
        return NextResponse.json({ artists });
    }
    catch (error) {
        console.error("[api/artists/founding] GET failed:", error);
        return NextResponse.json({ error: getErrorMessage(error), artists: [] }, { status: 500 });
    }
}
