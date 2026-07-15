import { NextResponse } from "next/server";
import { requirePlatformOwnerUserId } from "@/lib/admin-auth";
import { buildPlatformControlCenterSnapshot } from "@/lib/platform-control-center-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return NextResponse.json({ error: "Platform owner session is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/platform-control-center", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const owner = await requirePlatformOwnerUserId(userId);
        if (!owner.ok) {
            return NextResponse.json({ error: owner.error }, { status: owner.status });
        }

        const supabase = getSupabaseServerClient();
        const snapshot = await buildPlatformControlCenterSnapshot(supabase);
        return NextResponse.json({
            ok: true,
            snapshot,
        });
    }
    catch (error) {
        console.error("[api/launch/platform-control-center] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
