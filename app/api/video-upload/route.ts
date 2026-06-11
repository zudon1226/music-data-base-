import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/video-upload",
        message: "Video files upload directly from the browser to Supabase Storage.",
    });
}

export async function OPTIONS() {
    return jsonResponse({ ok: true, methods: ["GET"] });
}

export async function POST() {
    return jsonResponse({
        error: "Video files are not uploaded through this API route.",
        message: "Use supabase.storage.from('videos').upload(storagePath, file) in the browser, then save metadata after upload succeeds.",
    }, 410);
}
